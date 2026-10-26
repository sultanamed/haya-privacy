"""Verify the published companion on disposable GitHub-hosted runners only."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import re
import signal
import socket
import stat
import struct
import subprocess
import sys
import tempfile
import time
import zipfile

ORIGIN = 'chrome-extension://fkgjadiaajefdlgofbeidhghmhcniifk/'


def run(command, **kwargs):
    result = subprocess.run(command, capture_output=True, **kwargs)
    if result.returncode:
        # Native responses may contain a pairing token; never print stdout.
        raise RuntimeError('Verification command failed: ' + str(command[0]))
    return result


def invoke(launcher, origin):
    payload = b'{"command":"ensure","protocol":1}'
    started = time.perf_counter()
    result = subprocess.run([str(launcher), origin], input=struct.pack('=I', len(payload)) + payload,
                            capture_output=True, timeout=65)
    if origin != ORIGIN:
        assert result.returncode == 1 and not result.stdout
        return None
    assert result.returncode == 0 and len(result.stdout) >= 4
    size = struct.unpack('=I', result.stdout[:4])[0]
    assert len(result.stdout) == size + 4
    reply = json.loads(result.stdout[4:])
    assert reply.get('state') == 'ready', 'Native state: ' + str(reply.get('state'))
    assert re.fullmatch(r'[A-Za-z0-9_-]{16,256}', reply.get('token', ''))
    assert reply['token'].encode() not in result.stderr
    return reply['token'], round(time.perf_counter() - started, 3)


AUDIO_CHECK = r'''
import asyncio,json,sys,time
import aiohttp,numpy as np
token=json.load(sys.stdin)['token']
async def check():
 async with aiohttp.ClientSession() as session:
  async with session.get('http://127.0.0.1:8765/health',headers={'Authorization':'Bearer '+token}) as response:
   health=await response.json()
   assert response.status==200 and health.get('paired') and health.get('ready')
  async with session.get('http://127.0.0.1:8765/health',headers={'Authorization':'Bearer invalid-test-token'}) as response:
   assert response.status==401
  async with session.ws_connect('http://127.0.0.1:8765/audio',headers={'Origin':'chrome-extension://fkgjadiaajefdlgofbeidhghmhcniifk/'}) as ws:
   await ws.send_json({'token':token,'protocol':1,'metadata':True})
   assert (await ws.receive_json())['ready']
   t=np.arange(44100)/44100
   mixture=.15*np.sin(2*np.pi*220*t)+.05*np.sin(2*np.pi*880*t)
   packet=np.column_stack([mixture,mixture]).astype('<f4').tobytes()
   started=time.perf_counter()
   await ws.send_bytes(packet)
   metadata=await ws.receive_json(timeout=60)
   result=await ws.receive_bytes(timeout=60)
   assert len(result)==44100*2*4
   output=np.frombuffer(result,dtype='<f4')
   assert np.isfinite(output).all()
   seconds=round(time.perf_counter()-started,3)
   await ws.send_json({'reset':True})
   await ws.send_bytes(bytes(44100*2*4))
   silent_metadata=await ws.receive_json(timeout=60)
   silence=await ws.receive_bytes(timeout=60)
   assert len(silence)==44100*2*4 and np.max(np.abs(np.frombuffer(silence,dtype='<f4')))<1e-5
   return {'health_authenticated':True,'invalid_token_rejected':True,'audio_round_trip':True,
           'audio_packet_seconds':seconds,'analysis_route':metadata.get('analysis',{}).get('route'),
           'output_rms':round(float(np.sqrt(np.mean(output**2))),6),'silence_check':True}
print(json.dumps(asyncio.run(check())))
'''


def stop_test_motor(root):
    expected = str(root / 'engine/portable.py')
    if sys.platform == 'win32':
        code = 'Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress'
        result = run(['powershell', '-NoProfile', '-Command', code], text=True)
        for process in json.loads(result.stdout):
            if expected in (process.get('CommandLine') or ''):
                os.kill(int(process['ProcessId']), signal.SIGTERM)
    else:
        result = run(['ps', '-axo', 'pid=,args='], text=True)
        for line in result.stdout.splitlines():
            if expected in line:
                pid, command = line.strip().split(None, 1)
                if '--no-browser' in command:
                    os.kill(int(pid), signal.SIGTERM)


def main():
    assert os.environ.get('GITHUB_ACTIONS') == 'true', 'Use disposable CI runners; never modify a user Chrome profile.'
    parser = argparse.ArgumentParser()
    parser.add_argument('--assets', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args()
    target = {'darwin': 'macos-arm64', 'linux': 'linux-x64', 'win32': 'windows-x64'}[sys.platform]
    archive = args.assets / ('Haya-0.12.23-' + target + '.zip')
    expected = archive.with_suffix('.sha256').read_text().split()[0]
    with archive.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    assert digest == expected
    with socket.socket() as check:
        assert check.connect_ex(('127.0.0.1', 8765)) != 0, 'Test port already in use; stop.'
    report = {'target': target, 'platform': platform.platform(), 'archive_sha256': digest,
              'real_native_auto_start_tested': False, 'manual_browser_ui_tested': False}
    root = None
    installer = None
    with tempfile.TemporaryDirectory(prefix='haya test ') as temporary:
        work = Path(temporary)
        with zipfile.ZipFile(archive) as bundle:
            assert bundle.testzip() is None
            for info in bundle.infolist():
                path = work / info.filename
                assert path.resolve().is_relative_to(work.resolve())
                bundle.extract(info, work)
                mode = info.external_attr >> 16
                if mode and path.is_file():
                    path.chmod(stat.S_IMODE(mode))
        root = work / ('Haya-0.12.23-' + target)
        config = json.loads((root / 'native/host-config.json').read_text())
        assert config['allowed_origins'] == [ORIGIN]
        interpreter = root / ('runtime/python.exe' if sys.platform == 'win32' else 'runtime/bin/python3')
        module = importlib.util.spec_from_file_location('haya_installer', root / 'packaging/install_native.py')
        installer = importlib.util.module_from_spec(module)
        module.loader.exec_module(installer)
        home = work / 'clean user profile'
        try:
            manifest = installer.install(root, home=home)
            data = json.loads(manifest.read_text())
            assert data['allowed_origins'] == [ORIGIN]
            launcher = Path(data['path'])
            assert launcher.is_file()
            report['native_registration_tested'] = True
            invoke(launcher, 'chrome-extension://' + 'b' * 32 + '/')
            report['rejected_other_origin'] = True
            token, startup = invoke(launcher, ORIGIN)
            report['real_native_auto_start_tested'] = True
            report['startup_seconds'] = startup
            next_token, reuse = invoke(launcher, ORIGIN)
            assert next_token == token
            report['existing_motor_reused'] = True
            report['reuse_seconds'] = reuse
            result = run([str(interpreter), '-I', '-B', '-c', AUDIO_CHECK],
                         input=json.dumps({'token': token}), text=True, timeout=150)
            report.update(json.loads(result.stdout))
            installer.uninstall(root, home=home)
            assert not manifest.exists()
            report['native_uninstallation_tested'] = True
            report['ok'] = True
        finally:
            if installer is not None:
                installer.uninstall(root, home=home)
            if root is not None:
                stop_test_motor(root)
            time.sleep(.5)
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))


if __name__ == '__main__':
    main()

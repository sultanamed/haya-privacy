const release='https://github.com/sultanamed/haya-privacy/releases/download/ses-motoru-v0.12.23/';
export const PACKAGES=Object.freeze({
 'windows-x64':{label:'Windows · Intel / AMD 64 bit',size:'488 MB',file:'KUR-Windows.bat',url:release+'Haya-0.12.23-windows-x64.zip',install:'KUR-Windows.bat dosyasını açın ve kurulum sorusunu onaylayın.'},
 'macos-arm64':{label:'Mac · Apple Silicon (M serisi)',size:'446 MB',file:'KUR-Mac.command',url:release+'Haya-0.12.23-macos-arm64.zip',install:'KUR-Mac.command dosyasını açın ve kurulum sorusunu onaylayın.'},
 'linux-x64':{label:'Linux · Intel / AMD 64 bit',size:'586 MB',file:'bash KUR-Linux.sh',url:release+'Haya-0.12.23-linux-x64.zip',install:'Çıkardığınız klasörde terminal açıp bash KUR-Linux.sh komutunu çalıştırın ve kurulum sorusunu onaylayın.'}
});
export const UNSUPPORTED=Object.freeze({
 'macos-intel':'Intel işlemcili Mac için henüz bir müzik izolasyon motoru paketi yok.',
 'windows-arm':'Windows ARM için henüz uygun bir müzik izolasyon motoru paketi yok.',
 'linux-arm':'ARM işlemcili Linux için henüz uygun bir müzik izolasyon motoru paketi yok.',
 '32bit':'32 bit bilgisayarlar bu paketlerle desteklenmiyor.',
 'mobile':'Telefon ve tabletler bu bilgisayar paketleriyle desteklenmiyor.',
 'other':'Bu sistem için henüz uygun bir müzik izolasyon motoru paketi yok.'
});
export function chooseDevice({os='',arch='',bitness=''}={}){
 const family=/^(mac|macos)$/i.test(os)?'mac':/^(win|windows)$/i.test(os)?'windows':/^linux$/i.test(os)?'linux':/android|ios/i.test(os)?'mobile':'other';
 const arm=/^arm(?:64)?$/i.test(arch),x64=/^(x86-64|x64|amd64)$/i.test(arch)||(/^x86$/i.test(arch)&&bitness==='64');
 if(family==='mobile')return {family,key:'mobile'};
 if(family==='other')return {family,key:os?'other':''};
 if(arch==='x86-32'||bitness==='32')return {family,key:'32bit'};
 if(family==='mac')return {family,key:arm?'macos-arm64':x64?'macos-intel':''};
 return {family,key:arm?family+'-arm':x64?family+'-x64':''};
}
export async function detectDevice({runtime,navigator:nav=globalThis.navigator}={}){
 if(runtime?.getPlatformInfo){
  try{const result=chooseDevice(await runtime.getPlatformInfo());if(result.key)return result;}catch{}
 }
 if(nav?.userAgentData?.mobile||/Android|iPhone|iPad|iPod/i.test(nav?.userAgent||'')||(/Mac/i.test(nav?.platform||'')&&nav?.maxTouchPoints>1))return {family:'mobile',key:'mobile'};
 let info={};
 try{info=await nav?.userAgentData?.getHighEntropyValues?.(['architecture','bitness'])||{};}catch{}
 const os=nav?.userAgentData?.platform||(/Mac/i.test(nav?.platform||'')?'mac':/Win/i.test(nav?.platform||'')?'windows':/Linux/i.test(nav?.platform||'')?'linux':'');
 // Reduced user-agent strings can report Intel on ARM machines. Ask when unsure.
 return chooseDevice({os,arch:info.architecture||'',bitness:info.bitness||''});
}

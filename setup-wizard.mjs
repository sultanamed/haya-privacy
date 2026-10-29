import {PACKAGES,UNSUPPORTED,detectDevice} from './setup-platform.mjs';

export function startSetup({runtime,connectEngine,describeState}={}){
 const $=id=>document.getElementById(id);
 const device=$('device'),download=$('motor-download'),connection=$('connection-state');
 let connecting=false,currentStep=1,manualChoice=false;
 function updateDevice(){
  const pkg=PACKAGES[device.value];
  $('device-next').disabled=!pkg;
  $('device-summary').textContent=pkg?pkg.label+' · '+pkg.size+' · Müzik izolasyon motoru 0.12.23':UNSUPPORTED[device.value]||'İşlemci türünü bilmiyorsanız aşağıdaki kısa yardımı açın.';
  $('unsupported').hidden=!UNSUPPORTED[device.value];
  if(pkg){
   download.href=pkg.url;download.textContent=pkg.label.split(' · ')[0]+' için indir · '+pkg.size;
   $('chosen-device').textContent=pkg.label;
   $('install-command').textContent=pkg.file;
   $('install-instruction').textContent=pkg.install;
  }else download.removeAttribute('href');
  $('download-state').textContent='İndirme yalnızca düğmeye tıkladığınızda başlar.';
 }
 async function checkConnection(){
  if(!connectEngine||connecting)return;
  connecting=true;$('connect').disabled=true;$('connect').setAttribute('aria-busy','true');
  connection.dataset.state='checking';connection.textContent='Müzik izolasyon motoruna bağlanılıyor… İlk açılış biraz sürebilir.';
  $('ready-actions').hidden=true;
  try{
   const result=await connectEngine();
   const ready=result?.state==='ready';
   connection.dataset.state=ready?'ready':'attention';
   connection.textContent=ready?'Bağlandı. Müzik izolasyonu hazır. Sonraki videolarda otomatik bağlanır.':(describeState?.(result?.state)||'Bağlantı kurulamadı. KUR dosyasını çalıştırıp yeniden deneyin.');
   $('ready-actions').hidden=!ready;
  }catch{
   connection.dataset.state='attention';connection.textContent='Bağlantı kontrol edilemedi. Bu sayfayı yenileyip tekrar deneyin.';
  }finally{
   connecting=false;$('connect').disabled=false;$('connect').removeAttribute('aria-busy');
  }
 }
 function showStep(step,{focus=true}={}){
  if(step===2&&!PACKAGES[device.value])return;
  currentStep=step;
  for(const panel of document.querySelectorAll('[data-setup-panel]'))panel.hidden=Number(panel.dataset.setupPanel)!==step;
  for(const item of document.querySelectorAll('[data-setup-nav]')){
   const active=Number(item.dataset.setupNav)===step;
   if(active)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');
  }
  $('step-counter').textContent='Adım '+step+' / 3';
  if(focus)$('step-title-'+step).focus();
  if(step===3&&connectEngine)void checkConnection();
 }
 device.addEventListener('change',()=>{manualChoice=true;$('detection-note').textContent='Seçiminizi kullanıyoruz. İsterseniz değiştirebilirsiniz.';updateDevice();});
 $('device-next').addEventListener('click',()=>showStep(2));
 $('already-installed').addEventListener('click',()=>showStep(3));
 $('installed-next').addEventListener('click',()=>showStep(3));
 $('back-device').addEventListener('click',()=>showStep(1));
 $('back-install').addEventListener('click',()=>showStep(PACKAGES[device.value]?2:1));
 $('connect').addEventListener('click',checkConnection);
 download.addEventListener('click',event=>{
  if(!PACKAGES[device.value]){event.preventDefault();return;}
  $('download-state').textContent='İndirme isteği gönderildi. Tamamlandığında ZIP’i tamamen çıkarıp aşağıdaki kurulumu uygulayın.';
 });
 $('connect').hidden=!connectEngine;
 connection.hidden=!connectEngine;
 $('extension-connection-help').hidden=!!connectEngine;
 $('local-connection-help').hidden=!connectEngine;
 updateDevice();showStep(1,{focus:false});
 void detectDevice({runtime}).then(result=>{
  if(manualChoice)return;
  device.value=result.key;
  const names={mac:'Mac',windows:'Windows',linux:'Linux',mobile:'Mobil cihaz'};
  $('detection-note').textContent=result.key?(PACKAGES[result.key]?'Bilgisayarınıza uygun paket önerildi. Seçimi değiştirebilirsiniz.':'Bu cihaz için uyumluluk bilgisini kontrol edin.'):(names[result.family]?names[result.family]+' algılandı. İşlemci türünü seçerek devam edin.':'Bilgisayarınızın türünü seçerek devam edin.');
  updateDevice();
 }).catch(()=>{$('detection-note').textContent='Otomatik tanıma tamamlanamadı. Bilgisayarınızı aşağıdan seçebilirsiniz.';});
 return {showStep,get step(){return currentStep;}};
}

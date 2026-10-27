(function(){
'use strict';
var deferredPrompt=null;
var $=function(id){return document.getElementById(id);};
var instructions={
android:[
['سایت را با Chrome باز کنید','همین صفحه را در مرورگر Chrome گوشی باز کنید؛ از برنامه‌ها یا فایل‌های ناشناس استفاده نکنید.'],
['روی «نصب املاک ۰۵۸» بزنید','اگر دکمه نصب در بالای صفحه ظاهر شد، آن را لمس کنید و پنجره تأیید مرورگر را بپذیرید.'],
['اگر دکمه نصب نبود','از منوی سه‌نقطه Chrome، گزینه «Install app» یا «افزودن به صفحه اصلی» را انتخاب کنید.']
],
ios:[
['صفحه را در Safari باز کنید','لینک amlak058.ir/download را مستقیماً در مرورگر Safari باز کنید.'],
['منوی اشتراک‌گذاری را باز کنید','آیکون مربع و فلش رو به بالا را در نوار Safari لمس کنید.'],
['به صفحه اصلی اضافه کنید','گزینه «Add to Home Screen» یا «افزودن به صفحه اصلی» را انتخاب کنید و سپس Add را بزنید.']
],
desktop:[
['با Chrome یا Edge وارد شوید','صفحه املاک ۰۵۸ را در یک مرورگر به‌روز باز کنید.'],
['گزینه نصب را انتخاب کنید','اگر آیکون نصب در نوار آدرس یا دکمه نصب این صفحه دیده می‌شود، آن را انتخاب کنید.'],
['نصب را تأیید کنید','پنجره مرورگر را تأیید کنید. میانبر املاک ۰۵۸ از منوی برنامه‌های رایانه باز می‌شود.']
]
};
var labels={android:['اندروید / Chrome','مرورگر Chrome در گوشی‌های اندرویدی'],ios:['آیفون / Safari','مرورگر Safari در آیفون'],desktop:['کامپیوتر','مرورگر Chrome یا Edge در رایانه']};
function showSteps(device){var panel=$('stepsPanel');panel.replaceChildren();instructions[device].forEach(function(item,i){var card=document.createElement('article');card.className='step-card';var n=document.createElement('span');n.className='step-no';n.textContent=String(i+1).toLocaleString('fa-IR');var h=document.createElement('h3');h.textContent=item[0];var p=document.createElement('p');p.textContent=item[1];card.append(n,h,p);panel.appendChild(card);});document.querySelectorAll('.device-tab').forEach(function(b){var active=b.dataset.device===device;b.classList.toggle('active',active);b.setAttribute('aria-selected',active?'true':'false');});}
function detectDevice(){var ua=navigator.userAgent||'';if(/iPhone|iPad|iPod/i.test(ua))return'ios';if(/Android/i.test(ua))return'android';return'desktop';}
async function install(){if(deferredPrompt){deferredPrompt.prompt();try{var choice=await deferredPrompt.userChoice;$('installStatus').textContent=choice&&choice.outcome==='accepted'?'درخواست نصب تأیید شد. آیکون برنامه را در صفحه اصلی دستگاه پیدا کنید.':'نصب فعلاً انجام نشد؛ می‌توانید از راهنمای پایین استفاده کنید.';}catch(e){$('installStatus').textContent='برای نصب از راهنمای پایین صفحه استفاده کنید.';}deferredPrompt=null;$('installButton').hidden=true;return;}var d=detectDevice();showSteps(d);$('installStatus').textContent=d==='ios'?'در Safari از گزینه اشتراک‌گذاری و سپس «افزودن به صفحه اصلی» استفاده کنید.':'از منوی مرورگر گزینه «Install app» یا «افزودن به صفحه اصلی» را انتخاب کنید.';document.getElementById('stepsPanel').scrollIntoView({behavior:'smooth',block:'center'});}
function init(){showSteps(detectDevice());document.querySelectorAll('.device-tab').forEach(function(b){b.addEventListener('click',function(){showSteps(b.dataset.device);});});$('installButton').addEventListener('click',install);window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();deferredPrompt=e;$('installButton').hidden=false;});window.addEventListener('appinstalled',function(){$('installButton').hidden=true;$('installStatus').textContent='املاک ۰۵۸ نصب شد. آیکون آن را از صفحه اصلی باز کنید.';});if('serviceWorker'in navigator){navigator.serviceWorker.register('/sw.js?v=21').catch(function(e){console.warn('PWA service worker registration failed',e);});}var d=detectDevice();if(d==='ios'){$('installStatus').textContent='برای آیفون، راهنمای Safari را در بخش پایین ببینید.';}else{$('installStatus').textContent='اگر دکمه نصب نمایش داده نشد، راهنمای دستگاه خود را در پایین بخوانید.';}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
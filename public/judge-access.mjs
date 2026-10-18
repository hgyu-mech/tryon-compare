const intro=document.querySelector('.intro');
const access=document.createElement('div');access.className='judge-access';
const login=document.createElement('a');login.href='/judge';login.textContent='Judge sign-in';
const recorded=document.createElement('a');recorded.href='/?replay=1';recorded.textContent='View the recorded example';
access.append(login,recorded);intro?.append(access);

const samples=document.createElement('p');samples.className='judge-samples';
samples.append(document.createTextNode('Fictional demo photos: '));
for(const [label,url,name] of [['Person','/demo-inputs/person.png','fictional-person.png'],['Navy shirt','/demo-inputs/navy.png','navy-shirt.png'],['Olive overshirt','/demo-inputs/olive.png','olive-shirt.png']]){
 const link=document.createElement('a');link.href=url;link.download=name;link.textContent=label;samples.append(link);
}
intro?.append(samples);
const steps=document.createElement('p');steps.className='judge-sample-hint';steps.textContent='Download the example photos, choose them below, then confirm your permission before a live try-on. Inputs are AI-created fictional assets; prices are examples.';intro?.append(steps);

if(new URLSearchParams(location.search).get('replay')!=='1'){
 const notice=document.createElement('p');notice.className='judge-upload-notice';notice.append(document.createTextNode('Your selected photos are sent to YouCam for processing. Its API terms generally provide 30-day retention; provider settings and policies control retention. Clearing this board does not delete provider files. Only upload images you are authorized to use and have consent to process. '));
 const terms=document.createElement('a');terms.href='https://www.perfectcorp.com/perfectbeauty/youcam/terms-of-service-api';terms.target='_blank';terms.rel='noreferrer';terms.textContent='YouCam API terms';notice.append(terms);document.querySelector('.consent-panel')?.append(notice);
}
try{
 const response=await fetch('/api/config');if(!response.ok)throw Error('Unavailable');const config=await response.json();
 if(config.judgeAuthenticated){
  const signout=document.createElement('button');signout.type='button';signout.className='text-button';signout.textContent='Sign out';
  signout.addEventListener('click',async()=>{signout.disabled=true;try{await fetch('/api/judge/logout',{method:'POST',headers:{'X-App-Token':config.token}})}finally{location.href='/'}});
  login.replaceWith(signout);
 }
}catch{/* The original app remains usable for local comparisons. */}

/* =====================================================================
   BOOT
   ===================================================================== */
const MS_ICON = '<svg viewBox="0 0 21 21" aria-hidden="true"><rect x="1" y="1" width="9" height="9" fill="#F25022"/><rect x="11" y="1" width="9" height="9" fill="#7FBA00"/><rect x="1" y="11" width="9" height="9" fill="#00A4EF"/><rect x="11" y="11" width="9" height="9" fill="#FFB900"/></svg>';
function loginScreen(msg){
  applyBrand(); readDeepLink();            // keep an emailed approval link across sign-in (and the Microsoft redirect)
  const pw = CONFIG.PASSWORD_LOGIN !== false, ms = !!CONFIG.MICROSOFT_SSO;
  let out = ''; try{ out = sessionStorage.getItem('pera-out')||''; sessionStorage.removeItem('pera-out'); }catch(e){}
  const info = msg ? '' : out==='all' ? 'You have been signed out on all devices.' : out ? 'You have signed out. See you next time.' : '';
  $('#root').innerHTML = `<div class="login"><form class="panel" id="login-form" novalidate><div class="login-brand">${WORDMARK('by HeartPath Solutions')}<p class="tagline">Every payment, approved.</p></div><div class="panel-h"><h2 style="margin:0;font-size:16px">Sign in${brandInfo().client?' to '+esc(brandInfo().client):''}</h2></div>
    <div class="panel-b" style="display:flex;flex-direction:column;gap:12px">
    <div class="ok-msg" id="l-ok" role="status" ${info?'':'hidden'}>${esc(info)}</div>
    ${ms?`<button class="btn ms-btn" type="button" id="l-ms">${MS_ICON}<span>Sign in with Microsoft</span></button>${pw?'<div class="or-sep">or use your email and password</div>':''}`:''}
    ${pw?`<label class="f" for="l-email">Email<input id="l-email" type="email" autocomplete="username"></label>
      <label class="f" for="l-pass"><span class="lbl-row">Password<button type="button" class="link small" id="l-forgot">Forgot your password?</button></span><span class="pw-wrap"><input id="l-pass" type="password" autocomplete="current-password"><button type="button" class="btn sm ghost" id="l-show" aria-label="Show password">Show</button></span></label>`:''}
    <div class="err" id="l-err" role="alert" ${msg?'':'hidden'}>${esc(msg||'')}</div>${pw?`<button class="btn primary" type="submit" id="l-go" style="justify-content:center">Sign in</button>
      <div class="login-links"><span>New to Pera? <button type="button" class="link small" id="l-signup">Create your account</button></span><button type="button" class="link small" id="l-resend">Need the verification email sent again?</button></div>`:''}</div></form><p class="login-foot">© ${new Date().getFullYear()} HeartPath Solutions · Build. Automate. Transform.</p></div>`;
  const fail = m => { const el=$('#l-err'); el.hidden=false; el.textContent=m; $('#l-ok').hidden=true; };
  if (ms) $('#l-ms').addEventListener('click', async ()=>{
    const {error} = await Store.sb.auth.signInWithOAuth({provider:'azure', options:{scopes:'openid email profile offline_access', redirectTo: location.origin+location.pathname}});
    if (error) fail('Microsoft sign-in failed: '+error.message);
  });
  if (!pw){ $('#login-form').addEventListener('submit', e=>e.preventDefault()); return; }
  $('#l-show').addEventListener('click', e=>{ const i=$('#l-pass'), show=i.type==='password'; i.type=show?'text':'password'; e.target.textContent=show?'Hide':'Show'; e.target.setAttribute('aria-label',show?'Hide password':'Show password'); });
  $('#l-forgot').addEventListener('click', ()=>forgotScreen($('#l-email').value.trim()));
  $('#l-signup').addEventListener('click', ()=>signupScreen($('#l-email').value.trim()));
  $('#l-resend').addEventListener('click', ()=>signupScreen($('#l-email').value.trim(), true));
  $('#login-form').addEventListener('submit', async e=>{ e.preventDefault();
    const email=$('#l-email').value.trim(), pass=$('#l-pass').value;
    if (!email || !pass) return fail('Enter your email and password.');
    $('#l-go').disabled=true;
    const {error}=await Store.sb.auth.signInWithPassword({email,password:pass});
    if (error){ $('#l-go').disabled=false; return fail('Sign-in failed: '+error.message); }
    boot(); });
}
/* the reply is the same whether or not the email has an account, so the form can't be used to find out who works here */
function forgotScreen(email){
  $('#root').innerHTML = `<div class="login"><form class="panel" id="fp-form" novalidate><div class="login-brand">${WORDMARK('by HeartPath Solutions')}</div><div class="panel-h"><h2 style="margin:0;font-size:16px">Reset your password</h2></div>
    <div class="panel-b" style="display:flex;flex-direction:column;gap:12px"><p class="muted" style="margin:0">Enter the email you sign in with. We’ll send a link to choose a new password.</p>
    <label class="f" for="fp-email">Email<input id="fp-email" type="email" autocomplete="username" value="${esc(email||'')}"></label>
    <div class="ok-msg" id="fp-ok" role="status" hidden></div><div class="err" id="fp-err" role="alert" hidden></div>
    <button class="btn primary" type="submit" id="fp-go" style="justify-content:center">Send reset link</button><button class="link small" type="button" id="fp-back" style="align-self:center">Back to sign in</button></div></form></div>`;
  $('#fp-back').addEventListener('click', ()=>loginScreen());
  $('#fp-form').addEventListener('submit', async e=>{ e.preventDefault();
    const em = $('#fp-email').value.trim(), err=$('#fp-err');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)){ err.hidden=false; err.textContent='Enter a valid email address.'; return; }
    err.hidden=true; $('#fp-go').disabled=true;
    const {error} = await Store.sb.auth.resetPasswordForEmail(em, {redirectTo: location.origin+location.pathname});
    if (error && !/rate|limit/i.test(error.message||'')) console.warn(error);
    const ok=$('#fp-ok'); ok.hidden=false; ok.textContent = error && /rate|limit/i.test(error.message||'') ? 'Too many requests — wait a minute and try again.' : 'If '+em+' has a Pera account, a reset link is on its way. Check your inbox and spam folder.';
    $('#fp-go').disabled=false; });
}
/* people the administrator has added create their own login with the same work email; anyone else gets a login but no access */
function signupScreen(email, resendOnly){
  $('#root').innerHTML = `<div class="login"><form class="panel" id="su-form" novalidate><div class="login-brand">${WORDMARK('by HeartPath Solutions')}</div><div class="panel-h"><h2 style="margin:0;font-size:16px">${resendOnly?'Resend verification email':'Create your account'}</h2></div>
    <div class="panel-b" style="display:flex;flex-direction:column;gap:12px">
    <p class="muted" style="margin:0">${resendOnly?'Enter the email you signed up with and we’ll send the confirmation link again.':'Use the work email your administrator added to Pera. You’ll get an email to confirm it.'}</p>
    <label class="f" for="su-email">Work email<input id="su-email" type="email" autocomplete="username" value="${esc(email||'')}"></label>
    ${resendOnly?'':`<label class="f" for="su-pw1">Password<span class="pw-wrap"><input id="su-pw1" type="password" autocomplete="new-password"><button type="button" class="btn sm ghost" id="su-show">Show</button></span></label>
    <label class="f" for="su-pw2">Confirm password<input id="su-pw2" type="password" autocomplete="new-password"></label>
    <p class="faint" style="margin:0;font-size:12.5px">At least 10 characters with a letter and a number. Any symbols are allowed.</p>`}
    <div class="ok-msg" id="su-ok" role="status" hidden></div><div class="err" id="su-err" role="alert" hidden></div>
    <button class="btn primary" type="submit" id="su-go" style="justify-content:center">${resendOnly?'Resend email':'Create account'}</button>
    <button class="btn" type="button" id="su-again" hidden style="justify-content:center">Resend verification email</button>
    <button class="link small" type="button" id="su-back" style="align-self:center">Back to sign in</button></div></form></div>`;
  const fail = m => { const e=$('#su-err'); e.hidden=false; e.textContent=m; $('#su-ok').hidden=true; };
  const done = m => { const o=$('#su-ok'); o.hidden=false; o.textContent=m; $('#su-err').hidden=true; };
  const resend = async em => { const {error} = await Store.sb.auth.resend({type:'signup', email:em, options:{emailRedirectTo: location.origin+location.pathname}});
    if (error && /rate|limit/i.test(error.message||'')) return fail('Too many requests — wait a minute and try again.');
    done('If '+em+' is waiting for confirmation, a new link is on its way. Check your inbox and spam folder.'); };
  $('#su-back').addEventListener('click', ()=>loginScreen());
  if ($('#su-show')) $('#su-show').addEventListener('click', e=>{ const i=$('#su-pw1'), s=i.type==='password'; i.type=s?'text':'password'; e.target.textContent=s?'Hide':'Show'; });
  $('#su-again').addEventListener('click', ()=>resend($('#su-email').value.trim()));
  $('#su-form').addEventListener('submit', async e=>{ e.preventDefault();
    const em = $('#su-email').value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return fail('Enter a valid email address.');
    if (resendOnly) return resend(em);
    const a = $('#su-pw1').value, b = $('#su-pw2').value, bad = pwProblem(a, em);
    if (bad) return fail(bad); if (a!==b) return fail('The two passwords don’t match.');
    $('#su-go').disabled = true;
    const {data, error} = await Store.sb.auth.signUp({email:em, password:a, options:{emailRedirectTo: location.origin+location.pathname}});
    $('#su-go').disabled = false;
    if (error) return fail(/registered|exists/i.test(error.message||'') ? 'That email already has an account — sign in, or use Forgot your password.' : 'Could not create the account: '+error.message);
    if (data && data.session) return boot();
    done('Almost done — we sent a confirmation link to '+em+'. Open it to finish, then sign in.'); $('#su-again').hidden = false; });
}
async function boot(){
  try{ const ok = await Store.init(); if (!ok) return loginScreen(); await runSchedules(); App.view = RECOVERY ? 'profile' : Store.me.role==='supplier'?'portal':'dashboard'; if (RECOVERY) App.tab.prof='security'; else applyDeepLink(); App.render(); }
  catch(e){ console.error(e); if (LIVE) loginScreen(e.message||String(e)); else $('#root').innerHTML='<div class="empty">Could not start: '+esc(e.message||e)+'</div>'; }
}
if (LIVE){ const s=document.createElement('script'); s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.99.3/dist/umd/supabase.js'; s.onload=boot; s.onerror=()=>{ $('#root').innerHTML='<div class="empty">Could not load the Supabase library. Check the internet connection.</div>'; }; document.head.appendChild(s); }
else boot();
window.Pera = {App, Store};
})();

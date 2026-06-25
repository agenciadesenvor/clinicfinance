/* ===== INIT SUPABASE ===== */
let sb;
let _isRecoveryFlow = false; // flag para bloquear redirect durante recovery

try {
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession:     true,
      autoRefreshToken:   true,
      detectSessionInUrl: true,
      storageKey:         'clinic-finance-auth',
      lock: (_n, _t, fn) => fn()
    }
  });
} catch (e) {
  console.error('Erro ao inicializar Supabase:', e);
}

/* ===== AUTH STATE LISTENER (registrado ANTES de qualquer getSession) ===== */
if (sb) {
  sb.auth.onAuthStateChange((event, session) => {
    console.log('[Auth Event]', event);
    if (event === 'PASSWORD_RECOVERY') {
      _isRecoveryFlow = true;
      showResetForm();
    } else if (event === 'SIGNED_IN' && !_isRecoveryFlow) {
      window.location.replace('index.html');
    }
  });
}

/* ===== ROUTE GUARD =====
   Se o usuário já está logado e NÃO é recovery, vai direto para o app */
(async () => {
  if (!sb) return;

  // Detecta recovery via hash OU query params (PKCE usa ?code=)
  const hash   = window.location.hash || '';
  const search = window.location.search || '';
  const isRecovery = hash.includes('type=recovery') || search.includes('type=recovery');
  if (isRecovery) {
    _isRecoveryFlow = true;
    return;
  }

  // Se não é recovery e já tem sessão, redireciona
  const { data: { session } } = await sb.auth.getSession();
  if (session && !_isRecoveryFlow) {
    window.location.replace('index.html');
  }
})();

/* ===== TABS ===== */
function showTab(tab) {
  const isRegister = tab === 'register';
  document.getElementById('formLogin').classList.toggle('hidden', isRegister);
  document.getElementById('formRegister').classList.toggle('hidden', !isRegister);
  document.getElementById('formForgot').classList.add('hidden');
  document.getElementById('formReset').classList.add('hidden');
  document.getElementById('successState').classList.remove('show');
  document.getElementById('tabLogin').classList.toggle('active', !isRegister);
  document.getElementById('tabRegister').classList.toggle('active', isRegister);
  document.querySelectorAll('.auth-tabs').forEach(el => el.style.display = '');
  document.getElementById('cardTitle').textContent = isRegister ? 'Criar sua conta' : 'Bem-vinda de volta';
  document.getElementById('cardSub').textContent   = isRegister ? 'Preencha os dados abaixo para começar' : 'Entre na sua conta para continuar';
  clearAlert();
  clearErrors();
}

/* ===== ALERT ===== */
function showAlert(msg, type = 'error') {
  const el = document.getElementById('globalAlert');
  el.className = `auth-alert show ${type}`;
  document.getElementById('globalAlertText').textContent = msg;
}
function clearAlert() {
  document.getElementById('globalAlert').classList.remove('show');
}

/* ===== FIELD ERRORS ===== */
function showErr(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg || el.textContent; el.classList.add('show'); }
  const inp = document.getElementById(id.replace('err', '').replace(/^R/, 'reg').toLowerCase());
}
function clearErrors() {
  document.querySelectorAll('.auth-error').forEach(el => el.classList.remove('show'));
  document.querySelectorAll('.auth-input').forEach(el => el.classList.remove('error'));
}

function markError(inputId, errId, msg) {
  const input = document.getElementById(inputId);
  const err   = document.getElementById(errId);
  if (input) input.classList.add('error');
  if (err) { if (msg) err.textContent = msg; err.classList.add('show'); }
}

/* ===== PASSWORD TOGGLE ===== */
function togglePw(inputId, btn) {
  const input = document.getElementById(inputId);
  const isText = input.type === 'text';
  input.type = isText ? 'password' : 'text';
  btn.querySelector('svg').innerHTML = isText
    ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
    : '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>';
}

/* ===== CPF MASK ===== */
function maskCPF(input) {
  let v = input.value.replace(/\D/g, '').slice(0, 11);
  if (v.length > 9)      v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
  else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
  else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
  input.value = v;
}

function validateCPF(cpf) {
  cpf = cpf.replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0, rest;
  for (let i = 1; i <= 9; i++) sum += parseInt(cpf[i-1]) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  if (rest !== parseInt(cpf[9])) return false;
  sum = 0;
  for (let i = 1; i <= 10; i++) sum += parseInt(cpf[i-1]) * (12 - i);
  rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  return rest === parseInt(cpf[10]);
}

/* ===== PASSWORD STRENGTH ===== */
function checkStrength(pw) {
  const wrap = document.getElementById('pwStrength');
  if (!pw) { wrap.classList.remove('show'); return; }
  wrap.classList.add('show');
  let score = 0;
  if (pw.length >= 8)                         score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw))  score++;
  if (/\d/.test(pw))                          score++;
  if (/[^A-Za-z0-9]/.test(pw))               score++;
  const colors = ['#EF4444','#F59E0B','#10B981','#059669'];
  const labels = ['Fraca','Razoável','Boa','Forte'];
  for (let i = 1; i <= 4; i++) {
    const bar = document.getElementById(`pwBar${i}`);
    bar.style.background = i <= score ? colors[score-1] : '#E2E8F0';
  }
  document.getElementById('pwLabel').textContent = labels[score-1] || '';
  document.getElementById('pwLabel').style.color = colors[score-1] || '#94A3B8';
}

/* ===== SET LOADING ===== */
function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn.dataset.original = btn.innerHTML;
    btn.innerHTML = '<div class="spinner"></div> Aguarde…';
  } else {
    btn.innerHTML = btn.dataset.original || btn.innerHTML;
  }
}

/* ===== SHOW FORGOT PASSWORD FORM ===== */
function showForgot() {
  // Preenche com o e-mail do login se já digitou
  const loginEmail = document.getElementById('loginEmail').value.trim();
  if (loginEmail) document.getElementById('forgotEmail').value = loginEmail;

  // Esconde tudo e mostra o form de forgot
  document.getElementById('formLogin').classList.add('hidden');
  document.getElementById('formRegister').classList.add('hidden');
  document.getElementById('formForgot').classList.remove('hidden');
  document.getElementById('formReset').classList.add('hidden');
  document.getElementById('successState').classList.remove('show');
  document.querySelectorAll('.auth-tabs').forEach(el => el.style.display = 'none');
  document.getElementById('cardTitle').textContent = 'Recuperar senha';
  document.getElementById('cardSub').textContent = 'Enviaremos um link para seu e-mail';
  clearAlert(); clearErrors();
}

/* ===== HANDLE FORGOT SUBMIT ===== */
async function handleForgotSubmit(event) {
  event.preventDefault();
  clearErrors(); clearAlert();

  const email = document.getElementById('forgotEmail').value.trim();
  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    markError('forgotEmail', 'errForgotEmail', 'E-mail inválido');
    return;
  }

  setLoading('btnForgot', true);
  try {
    if (!sb) throw new Error('Supabase não inicializado');
    // Usa a URL atual sem hash/query para garantir redirect correto
    const redirectUrl = window.location.href.split('?')[0].split('#')[0];
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl
    });
    if (error) throw error;
    showAlert('Link de redefinição enviado para ' + email + '. Verifique sua caixa de entrada e spam.', 'success');
  } catch (err) {
    showAlert(translateError(err.message));
  } finally {
    setLoading('btnForgot', false);
  }
}

/* ===== SHOW RESET PASSWORD FORM ===== */
function showResetForm() {
  document.getElementById('formLogin').classList.add('hidden');
  document.getElementById('formRegister').classList.add('hidden');
  document.getElementById('formForgot').classList.add('hidden');
  document.getElementById('formReset').classList.remove('hidden');
  document.getElementById('successState').classList.remove('show');
  document.querySelectorAll('.auth-tabs').forEach(el => el.style.display = 'none');
  document.getElementById('cardTitle').textContent = 'Nova senha';
  document.getElementById('cardSub').textContent = 'Defina sua nova senha abaixo';
  clearAlert(); clearErrors();
}

/* ===== HANDLE RESET PASSWORD SUBMIT ===== */
async function handleResetSubmit(event) {
  event.preventDefault();
  clearErrors(); clearAlert();

  const password = document.getElementById('resetPassword').value;
  const confirm  = document.getElementById('resetConfirm').value;
  let valid = true;

  if (password.length < 8) { markError('resetPassword', 'errResetPassword', 'Mínimo 8 caracteres'); valid = false; }
  if (password !== confirm) { markError('resetConfirm', 'errResetConfirm', 'Senhas não coincidem'); valid = false; }
  if (!valid) return;

  setLoading('btnReset', true);
  try {
    if (!sb) throw new Error('Supabase não inicializado');
    const { error } = await sb.auth.updateUser({ password });
    if (error) throw error;
    showAlert('Senha redefinida com sucesso! Faça login com sua nova senha.', 'success');
    // Faz logout para forçar novo login com a senha nova
    await sb.auth.signOut();
    setTimeout(() => showTab('login'), 2000);
  } catch (err) {
    showAlert(translateError(err.message));
  } finally {
    setLoading('btnReset', false);
  }
}

/* ===== LOGIN ===== */
async function handleLogin(event) {
  event.preventDefault();
  clearErrors(); clearAlert();

  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  let valid = true;

  if (!email || !/\S+@\S+\.\S+/.test(email)) { markError('loginEmail', 'errLoginEmail', 'E-mail inválido'); valid = false; }
  if (!password) { markError('loginPassword', 'errLoginPassword', 'Senha obrigatória'); valid = false; }
  if (!valid) return;

  setLoading('btnLogin', true);
  try {
    if (!sb) throw new Error('Supabase não inicializado');
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // Redireciona para o app após login
    window.location.replace('index.html');
  } catch (err) {
    showAlert(translateError(err.message));
    setLoading('btnLogin', false);
  }
}

/* ===== REGISTER ===== */
async function handleRegister(event) {
  event.preventDefault();
  clearErrors(); clearAlert();

  const firstName = document.getElementById('regFirstName').value.trim();
  const lastName  = document.getElementById('regLastName').value.trim();
  const email     = document.getElementById('regEmail').value.trim();
  const cpfRaw    = document.getElementById('regCPF').value;
  const password  = document.getElementById('regPassword').value;
  const confirm   = document.getElementById('regConfirm').value;
  let valid = true;

  if (!firstName)              { markError('regFirstName', 'errRegFirstName', 'Campo obrigatório'); valid = false; }
  if (!lastName)               { markError('regLastName',  'errRegLastName',  'Campo obrigatório'); valid = false; }
  if (!email || !/\S+@\S+\.\S+/.test(email)) { markError('regEmail', 'errRegEmail', 'E-mail inválido'); valid = false; }
  if (!validateCPF(cpfRaw))    { markError('regCPF', 'errRegCPF', 'CPF inválido'); valid = false; }
  if (password.length < 8)     { markError('regPassword', 'errRegPassword', 'Mínimo 8 caracteres'); valid = false; }
  if (password !== confirm)    { markError('regConfirm',  'errRegConfirm',  'Senhas não coincidem'); valid = false; }
  if (!valid) return;

  setLoading('btnRegister', true);
  try {
    if (!sb) throw new Error('Supabase não inicializado');
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name:  lastName,
          cpf:        cpfRaw
        },
        emailRedirectTo: window.location.href.split('?')[0].split('#')[0]
      }
    });
    if (error) throw error;

    // Mostrar estado de sucesso
    document.getElementById('formRegister').classList.add('hidden');
    document.getElementById('successEmail').textContent = email;
    document.getElementById('successState').classList.add('show');
    document.getElementById('cardTitle').textContent = 'Conta criada!';
    document.getElementById('cardSub').textContent   = 'Falta apenas um passo';
    document.querySelectorAll('.auth-tabs').forEach(el => el.style.display = 'none');

  } catch (err) {
    showAlert(translateError(err.message));
    setLoading('btnRegister', false);
  }
}

/* ===== TRANSLATE ERRORS ===== */
function translateError(msg) {
  if (!msg) return 'Erro desconhecido. Tente novamente.';
  if (msg.includes('Invalid login credentials'))      return 'E-mail ou senha incorretos.';
  if (msg.includes('Email not confirmed'))            return 'E-mail não confirmado. Verifique sua caixa de entrada.';
  if (msg.includes('User already registered'))        return 'Este e-mail já possui uma conta. Faça login.';
  if (msg.includes('Password should be at least'))    return 'A senha precisa ter no mínimo 8 caracteres.';
  if (msg.includes('Unable to validate email'))       return 'E-mail inválido.';
  if (msg.includes('sending confirmation email'))     return 'Erro ao enviar e-mail de confirmação. Tente novamente em alguns minutos.';
  if (msg.includes('rate limit'))                     return 'Muitas tentativas. Aguarde alguns minutos.';
  if (msg.includes('network'))                        return 'Erro de conexão. Verifique sua internet.';
  if (msg.includes('same_password'))                  return 'A nova senha não pode ser igual à anterior.';
  if (msg.includes('Auth session missing'))           return 'Sessão expirada. Solicite um novo link de redefinição.';
  if (msg.includes('Token has expired') || msg.includes('otp_expired')) return 'Link expirado. Solicite um novo link de redefinição.';
  return msg;
}

/* ===== HANDLE RECOVERY VIA URL (fallback) =====
   Se o hash contém type=recovery mas o evento não disparou ainda */
(async () => {
  if (!sb) return;
  const hash = window.location.hash || '';
  const params = new URLSearchParams(hash.replace('#', ''));
  if (params.get('type') === 'recovery') {
    _isRecoveryFlow = true;
    showResetForm();
  }
})();

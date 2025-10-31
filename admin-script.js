const { createClient } = supabase;
const client = createClient(
  'https://jvizodlmiiisubatqykg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2aXpvZGxtaWlpc3ViYXRxeWtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2NjYxNTYsImV4cCI6MjA3NzI0MjE1Nn0.YD9tMUyQVq7v5gkWq-f_sQfYfD2raq_o7FeOmLjeN7I'
);

const authScreen = document.getElementById('auth-screen');
const app = document.getElementById('app');
const emailInput = document.getElementById('email');
const loginBtn = document.getElementById('login-btn');
const authMsg = document.getElementById('auth-msg');

let senseId = 1;
const MAX_SENSES = 6;

async function checkSession() {
  const {  { session } } = await client.auth.getSession();
  if (!session) {
    authScreen.style.display = 'flex';
    app.style.display = 'none';
    return;
  }

  const userEmail = session.user.email;
  const {  admin, error } = await client
    .from('admins')
    .select('email')
    .eq('email', userEmail)
    .single();

  if (error || !admin) {
    authMsg.textContent = 'Access denied. Contact the administrator.';
    authMsg.className = 'error';
    authScreen.style.display = 'flex';
    app.style.display = 'none';
    await client.auth.signOut();
  } else {
    authScreen.style.display = 'none';
    app.style.display = 'block';
    initApp();
  }
}

if (loginBtn) {
  loginBtn.addEventListener('click', async () => {
    const email = emailInput?.value.trim();
    if (!email) {
      authMsg.textContent = 'Please enter your email.';
      authMsg.className = 'error';
      return;
    }
    const { error } = await client.auth.signInWithOtp({
      email: email,
      options: {
        emailRedirectTo: 'https://lexidictionary.github.io/AddLexiEntry_Kyrgyz/'
      }
    });
    if (error) {
      authMsg.textContent = 'Error: ' + error.message;
      authMsg.className = 'error';
    } else {
      authMsg.textContent = 'Login link sent! Check your email.';
      authMsg.className = 'success';
    }
  });
}

function initApp() {
  const form = document.getElementById('form');
  const sensesDiv = document.getElementById('senses');
  const addSenseBtn = document.getElementById('add-sense');

  addSenseBtn.addEventListener('click', () => {
    if (sensesDiv.children.length >= MAX_SENSES) {
      showMessage(`Maximum ${MAX_SENSES} senses allowed.`, 'error');
      return;
    }
    senseId++;
    const template = document.querySelector('.sense');
    const clone = template.cloneNode(true);
    clone.dataset.id = senseId;
    clone.querySelector('h2').textContent = `Sense ${senseId}`;
    clone.querySelectorAll('input, textarea, select').forEach(el => el.value = '');
    const firstPair = clone.querySelector('.pair');
    firstPair.querySelector('.ex-kg').required = true;
    firstPair.querySelector('.ex-en').required = true;
    sensesDiv.appendChild(clone);
  });

  form.addEventListener('click', e => {
    const t = e.target;
    if (t.classList.contains('add-ex')) {
      const list = t.previousElementSibling;
      const pair = document.createElement('div');
      pair.className = 'pair';
      pair.innerHTML = `
        <input placeholder="Kyrgyz sentence" class="ex-kg" />
        <input placeholder="English translation" class="ex-en" />
        <button type="button" class="del">×</button>
      `;
      list.appendChild(pair);
    }
    if (t.classList.contains('add-rel')) {
      const list = t.previousElementSibling;
      const pair = document.createElement('div');
      pair.className = 'pair';
      pair.innerHTML = `
        <input placeholder="Kyrgyz phrase" class="rel-kg" />
        <input placeholder="English translation" class="rel-en" />
        <button type="button" class="del">×</button>
      `;
      list.appendChild(pair);
    }
    if (t.classList.contains('del') && !t.classList.contains('del-sense')) {
      t.parentElement.remove();
    }
    if (t.classList.contains('del-sense')) {
      if (sensesDiv.children.length <= 1) {
        showMessage('Cannot remove the last sense.', 'error');
        return;
      }
      t.closest('.sense').remove();
    }
  });

  function showMessage(text, type) {
    const m = document.getElementById('msg');
    m.textContent = text;
    m.className = type;
    setTimeout(() => { m.textContent = ''; m.className = ''; }, 3500);
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.submitter;
    btn.disabled = true;
    showMessage('', '');

    const canon = document.getElementById('canon').value.trim();
    if (!canon) return showMessage('Canonical form is required.', 'error'), btn.disabled = false;

    const {  exists } = await client.from('lemmas').select('id').eq('canonical', canon);
    if (exists?.length) return showMessage('Lemma already exists.', 'error'), btn.disabled = false;

    try {
      const formsInput = document.getElementById('forms').value;
      const forms = formsInput ? formsInput.split(',').map(s => s.trim()).filter(Boolean) : [];
      const cefr = document.getElementById('cefr').value || null;

      const {  lemma } = await client
        .from('lemmas')
        .insert({ canonical: canon, pronunciation: document.getElementById('pron').value.trim(), cefr })
        .select()
        .single();

      if (forms.length) {
        await Promise.all(forms.map(form => 
          client.from('forms').insert({ lemma_id: lemma.id, form })
        ));
      }

      for (const senseEl of document.querySelectorAll('.sense')) {
        const pos = senseEl.querySelector('.pos').value;
        const topic = senseEl.querySelector('.topic').value.trim() || null;
        const translation = senseEl.querySelector('.trans').value.trim();
        if (!pos || !translation) continue;

        let hasValidExample = false;
        const exKgList = senseEl.querySelectorAll('.ex-kg');
        const exEnList = senseEl.querySelectorAll('.ex-en');
        for (let i = 0; i < exKgList.length; i++) {
          if (exKgList[i].value.trim() && exEnList[i]?.value.trim()) {
            hasValidExample = true;
            break;
          }
        }
        if (!hasValidExample) {
          return showMessage('Each sense must have at least one complete example.', 'error'), btn.disabled = false;
        }

        let grammarData = null;
        const grammarText = senseEl.querySelector('.grammar-text').value.trim();
        if (grammarText) {
          try {
            grammarData = JSON.parse(grammarText);
          } catch (e) {
            grammarData = grammarText;
          }
        }

        const {  sense } = await client
          .from('senses')
          .insert({
            lemma_id: lemma.id,
            pos,
            topic,
            translation,
            grammar: grammarData
          })
          .select()
          .single();

        for (let i = 0; i < exKgList.length; i++) {
          const kg = exKgList[i].value.trim();
          const en = exEnList[i]?.value.trim();
          if (kg && en) {
            await client.from('examples').insert({ sense_id: sense.id, kg, en });
          }
        }

        const relKgList = senseEl.querySelectorAll('.rel-kg');
        const relEnList = senseEl.querySelectorAll('.rel-en');
        for (let i = 0; i < relKgList.length; i++) {
          const kg = relKgList[i].value.trim();
          const en = relEnList[i]?.value.trim();
          if (kg && en) {
            await client.from('related').insert({ sense_id: sense.id, word: kg, translation: en });
          }
        }
      }

      showMessage('✅ Lemma added successfully!', 'success');
      setTimeout(() => location.reload(), 1800);
    } catch (err) {
      console.error(err);
      showMessage('❌ Error: ' + (err.message || 'unknown'), 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

setTimeout(() => {
  checkSession();
}, 800);

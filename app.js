
(() => {
  const cfg = window.PAWBUDGET_CONFIG;
  const toast = document.getElementById('toast');

  const showToast = (message) => {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(window.__pbToast);
    window.__pbToast = setTimeout(() => toast.classList.remove('show'), 2200);
  };

  if (!window.supabase || !cfg?.supabaseUrl || !cfg?.supabaseKey) {
    document.getElementById('authMessage').textContent = 'PawBudget configuration is missing.';
    document.getElementById('authMessage').className = 'auth-message error';
    return;
  }

  const db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
  let authMode = 'signin';
  let currentSession = null;
  let cachedTransactions = [];

  const authScreen = document.getElementById('authScreen');
  const appShell = document.getElementById('appShell');
  const authForm = document.getElementById('authForm');
  const emailInput = document.getElementById('authEmail');
  const passwordInput = document.getElementById('authPassword');
  const authTitle = document.getElementById('authTitle');
  const authSubtitle = document.getElementById('authSubtitle');
  const authMessage = document.getElementById('authMessage');
  const primaryAuthButton = document.getElementById('primaryAuthButton');
  const switchAuthMode = document.getElementById('switchAuthMode');

  const money = (value) => new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0
  }).format(Number(value || 0));

  const money2 = (value) => new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD'
  }).format(Number(value || 0));

  const setAuthMessage = (text = '', type = '') => {
    authMessage.textContent = text;
    authMessage.className = `auth-message ${type}`.trim();
  };

  const setAuthBusy = (busy) => {
    primaryAuthButton.disabled = busy;
    primaryAuthButton.textContent = busy
      ? (authMode === 'signin' ? 'Signing in…' : 'Creating account…')
      : (authMode === 'signin' ? 'Sign in' : 'Create account');
  };

  const setAuthMode = (mode) => {
    authMode = mode;
    const signup = mode === 'signup';
    authTitle.textContent = signup ? 'Create Anna’s PawBudget' : 'Welcome back, Anna!';
    authSubtitle.textContent = signup
      ? 'Create your private login. Your categories will be prepared automatically.'
      : 'Sign in to your private PawBudget dashboard.';
    primaryAuthButton.textContent = signup ? 'Create account' : 'Sign in';
    switchAuthMode.textContent = signup ? 'Already have an account? Sign in' : 'Create account';
    passwordInput.autocomplete = signup ? 'new-password' : 'current-password';
    setAuthMessage();
  };

  switchAuthMode.addEventListener('click', () => setAuthMode(authMode === 'signin' ? 'signup' : 'signin'));

  document.getElementById('togglePassword').addEventListener('click', () => {
    passwordInput.type = passwordInput.type === 'password' ? 'text' : 'password';
  });

  authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || password.length < 6) {
      setAuthMessage('Enter a valid email and a password with at least 6 characters.', 'error');
      return;
    }

    setAuthBusy(true);
    setAuthMessage();

    try {
      if (authMode === 'signup') {
        const { data, error } = await db.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: 'Anna' },
            emailRedirectTo: cfg.siteUrl
          }
        });
        if (error) throw error;

        if (data.session) {
          await showApp(data.session);
        } else {
          setAuthMessage('Account created. Check your email for the Supabase confirmation link, then return here and sign in.', 'success');
        }
      } else {
        const { data, error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await showApp(data.session);
      }
    } catch (error) {
      setAuthMessage(error.message || 'Authentication failed.', 'error');
    } finally {
      setAuthBusy(false);
    }
  });

  document.getElementById('forgotPassword').addEventListener('click', async () => {
    const email = emailInput.value.trim();
    if (!email) {
      setAuthMessage('Enter your email first, then click “Forgot password?”.', 'error');
      return;
    }
    try {
      const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: cfg.siteUrl });
      if (error) throw error;
      setAuthMessage('Password reset email sent. Use the link in that email to return to PawBudget.', 'success');
    } catch (error) {
      setAuthMessage(error.message || 'Could not send reset email.', 'error');
    }
  });

  document.getElementById('signOutButton').addEventListener('click', async () => {
    await db.auth.signOut();
    currentSession = null;
    appShell.classList.add('hidden');
    authScreen.classList.remove('hidden');
    setAuthMode('signin');
    showToast('Signed out safely.');
  });

  async function showApp(session) {
    if (!session) return;
    currentSession = session;
    authScreen.classList.add('hidden');
    appShell.classList.remove('hidden');
    await loadProfile();
    await loadDashboard();
  }

  async function loadProfile() {
    const userId = currentSession.user.id;
    let name = 'Anna';
    try {
      const { data, error } = await db.from('profiles').select('display_name').eq('id', userId).maybeSingle();
      if (!error && data?.display_name) name = data.display_name;
    } catch (_) {}
    document.getElementById('profileName').textContent = `${name}!`;
    document.getElementById('heroName').textContent = name;
  }

  const startOfMonthISO = (date = new Date()) => {
    const d = new Date(date.getFullYear(), date.getMonth(), 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
  };
  const endOfMonthISO = (date = new Date()) => {
    const d = new Date(date.getFullYear(), date.getMonth()+1, 0);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  async function loadDashboard() {
    const now = new Date();
    const monthStart = startOfMonthISO(now);
    const monthEnd = endOfMonthISO(now);
    const userId = currentSession.user.id;

    document.getElementById('snapshotSubtitle').textContent =
      `Here’s your financial snapshot for ${now.toLocaleString('en-US',{month:'long',year:'numeric'})}.`;
    document.getElementById('monthChip').textContent =
      `📅 ${now.toLocaleString('en-US',{month:'long',year:'numeric'})}`;

    try {
      const [
        transactionsResult,
        budgetsResult,
        savingsResult,
        goalsResult,
        debtsResult
      ] = await Promise.all([
        db.from('transactions')
          .select('id,transaction_type,amount,transaction_date,merchant,description,is_recurring,category_id,subcategory_id,categories(name),subcategories(name)')
          .eq('user_id', userId)
          .order('transaction_date', { ascending:false })
          .limit(1000),
        db.from('budgets')
          .select('amount,category_id,categories(name)')
          .eq('user_id', userId)
          .gte('budget_month', monthStart)
          .lte('budget_month', monthEnd),
        db.from('savings_contributions')
          .select('amount,contribution_date')
          .eq('user_id', userId)
          .gte('contribution_date', monthStart)
          .lte('contribution_date', monthEnd),
        db.from('savings_goals')
          .select('id,name,target_amount,status,savings_contributions(amount)')
          .eq('user_id', userId)
          .eq('status','active')
          .limit(4),
        db.from('debts')
          .select('id,name,current_balance,monthly_payment,status')
          .eq('user_id', userId)
          .eq('status','active')
          .limit(4)
      ]);

      if (transactionsResult.error) throw transactionsResult.error;

      cachedTransactions = transactionsResult.data || [];
      const monthTransactions = cachedTransactions.filter(t =>
        t.transaction_date >= monthStart && t.transaction_date <= monthEnd
      );

      const income = monthTransactions
        .filter(t => t.transaction_type === 'income')
        .reduce((s,t) => s + Number(t.amount), 0);

      const expenses = monthTransactions
        .filter(t => t.transaction_type === 'expense')
        .reduce((s,t) => s + Number(t.amount), 0);

      const recurring = monthTransactions.filter(t => t.transaction_type === 'expense' && t.is_recurring);
      const bills = recurring.reduce((s,t) => s + Number(t.amount),0);

      const savingsAdded = (savingsResult.data || []).reduce((s,x)=>s+Number(x.amount),0);
      const activeDebts = debtsResult.data || [];
      const monthlyDebt = activeDebts.reduce((s,d)=>s+Number(d.monthly_payment || 0),0);

      const budgets = budgetsResult.data || [];
      const budgetTotal = budgets.reduce((s,b)=>s+Number(b.amount),0);
      const left = Math.max(0, budgetTotal - expenses);

      document.getElementById('kpiIncome').textContent = money(income);
      document.getElementById('kpiSpent').textContent = money(expenses);
      document.getElementById('kpiBills').textContent = money(bills);
      document.getElementById('billsCaption').textContent = `${recurring.length} recurring transaction${recurring.length===1?'':'s'}`;
      document.getElementById('kpiSavings').textContent = money(savingsAdded);
      document.getElementById('kpiDebt').textContent = money(monthlyDebt);
      document.getElementById('debtCaption').textContent = `${activeDebts.length} active payment${activeDebts.length===1?'':'s'}`;
      document.getElementById('kpiLeft').textContent = money(left);
      document.getElementById('leftCaption').textContent = budgetTotal ? `${money(budgetTotal)} total budget` : 'No monthly budget yet';
      document.getElementById('donutTotal').textContent = money(expenses);

      document.getElementById('emptyState').classList.toggle('hidden', cachedTransactions.length > 0);

      renderRecent(monthTransactions.length ? monthTransactions : cachedTransactions);
      renderCategories(monthTransactions);
      renderTrend(cachedTransactions);
      renderBudgetChart(budgets, monthTransactions);
      renderSavingsGoals(goalsResult.data || []);
      renderDebts(activeDebts);
      renderExplorer(monthTransactions);
      renderInsight(monthTransactions, income, expenses);

    } catch (error) {
      console.error(error);
      document.getElementById('cloudStatus').innerHTML = '<span style="background:#e24d5f"></span> Connected · data error';
      showToast('Supabase connected, but dashboard data could not be loaded.');
    }
  }

  function renderRecent(rows) {
    const box = document.getElementById('recentTransactions');
    const head = '<div class="tr head"><span>Date</span><span>Merchant</span><span>Category</span><span>Amount</span></div>';
    if (!rows.length) {
      box.innerHTML = head + '<div class="no-data-row">No real transactions yet.</div>';
      return;
    }
    const html = rows.slice(0,5).map(t => {
      const date = new Date(`${t.transaction_date}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric'});
      const merchant = t.merchant || t.description || 'Transaction';
      const category = t.categories?.name || 'Uncategorized';
      const isIncome = t.transaction_type === 'income';
      return `<div class="tr tx-row">
        <span>${date}</span><span>${escapeHtml(merchant)}</span><span>${escapeHtml(category)}</span>
        <b class="${isIncome?'positive-amount':'negative-amount'}">${isIncome?'+':'-'}${money2(t.amount)}</b>
      </div>`;
    }).join('');
    box.innerHTML = head + html;
  }

  function renderCategories(rows) {
    const expenses = rows.filter(t => t.transaction_type === 'expense');
    const map = {};
    expenses.forEach(t => {
      const name = t.categories?.name || 'Uncategorized';
      map[name] = (map[name] || 0) + Number(t.amount);
    });
    const entries = Object.entries(map).sort((a,b)=>b[1]-a[1]);
    const total = entries.reduce((s,[,v])=>s+v,0);
    const legend = document.getElementById('categoryLegend');
    const donut = document.getElementById('donut');

    if (!entries.length) {
      donut.style.background = '#eef2f5';
      legend.innerHTML = '<div class="legend-empty">Your expense categories will appear here.</div>';
      return;
    }

    const colors = ['#86bbf4','#ff8f9f','#fac66c','#cd82e8','#7e69e4','#65c8a3','#f0a84b','#6cb1b2','#ff7282','#a3c46b'];
    let running = 0;
    const segments = entries.map(([,value],i)=>{
      const start = running;
      const percent = total ? value/total*100 : 0;
      running += percent;
      return `${colors[i%colors.length]} ${start.toFixed(2)}% ${running.toFixed(2)}%`;
    });
    donut.style.background = `conic-gradient(${segments.join(',')})`;
    legend.innerHTML = entries.slice(0,9).map(([name,value],i)=>{
      const pct = total ? value/total*100 : 0;
      return `<div class="category-row"><i style="background:${colors[i%colors.length]}"></i><span>${escapeHtml(name)}</span><b>${pct.toFixed(0)}%</b></div>`;
    }).join('');
  }

  function renderTrend(allRows) {
    const container = document.getElementById('trendChart');
    const now = new Date();
    const months = [];
    for (let i=5;i>=0;i--) months.push(new Date(now.getFullYear(), now.getMonth()-i, 1));
    const data = months.map(d=>{
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const rows = allRows.filter(t=>t.transaction_date?.startsWith(key));
      return {
        label:d.toLocaleString('en-US',{month:'short'}),
        income:rows.filter(t=>t.transaction_type==='income').reduce((s,t)=>s+Number(t.amount),0),
        expense:rows.filter(t=>t.transaction_type==='expense').reduce((s,t)=>s+Number(t.amount),0)
      };
    });
    const max = Math.max(0,...data.flatMap(d=>[d.income,d.expense]));
    if (!max) {
      container.innerHTML = '<div class="chart-empty">Add transactions to see your six-month trend.</div>';
      return;
    }
    container.innerHTML = `<div class="trend-bars">${data.map(d=>{
      const ih = Math.max(2,d.income/max*88);
      const eh = Math.max(2,d.expense/max*88);
      return `<div class="trend-month"><i class="inc" style="height:${ih}%"></i><i class="exp" style="height:${eh}%"></i><span>${d.label}</span></div>`;
    }).join('')}</div>`;
  }

  function renderBudgetChart(budgets, monthRows) {
    const container = document.getElementById('budgetChart');
    if (!budgets.length) {
      container.className = 'budget-chart-empty';
      container.textContent = 'Set monthly category budgets to compare them with actual spending.';
      return;
    }
    const actualByCat = {};
    monthRows.filter(t=>t.transaction_type==='expense').forEach(t=>{
      const name=t.categories?.name||'Uncategorized';
      actualByCat[name]=(actualByCat[name]||0)+Number(t.amount);
    });
    container.className = 'budget-list';
    container.innerHTML = budgets.slice(0,7).map(b=>{
      const name=b.categories?.name||'Category';
      const budget=Number(b.amount);
      const actual=actualByCat[name]||0;
      const pct=budget?Math.min(140,actual/budget*100):0;
      return `<div class="goal"><div class="goal-head"><strong>${escapeHtml(name)}</strong><span>${money(actual)} / ${money(budget)}</span></div><div class="progress"><i style="width:${Math.min(100,pct)}%;background:${pct>100?'#f56b7f':''}"></i></div></div>`;
    }).join('');
  }

  function renderSavingsGoals(goals) {
    const box=document.getElementById('savingsGoals');
    if(!goals.length){box.className='simple-empty';box.textContent='No savings goals yet.';return}
    box.className='';
    box.innerHTML=goals.map(g=>{
      const saved=(g.savings_contributions||[]).reduce((s,c)=>s+Number(c.amount),0);
      const pct=g.target_amount?Math.min(100,saved/Number(g.target_amount)*100):0;
      return `<div class="goal"><div class="goal-head"><strong>${escapeHtml(g.name)}</strong><span>${money(saved)} / ${money(g.target_amount)}</span></div><div class="progress"><i style="width:${pct}%"></i></div></div>`;
    }).join('');
  }

  function renderDebts(debts) {
    const box=document.getElementById('debtList');
    if(!debts.length){box.className='simple-empty';box.textContent='No debt or EMI items yet.';return}
    box.className='';
    box.innerHTML=debts.map(d=>`<div class="debt-row"><div class="debt-head"><strong>${escapeHtml(d.name)}</strong><span>${money(d.current_balance)} remaining · ${money(d.monthly_payment)}/mo</span></div></div>`).join('');
  }

  function renderExplorer(rows) {
    const expenses=rows.filter(t=>t.transaction_type==='expense');
    const byCat={};
    expenses.forEach(t=>{
      const cat=t.categories?.name||'Uncategorized';
      byCat[cat]=(byCat[cat]||0)+Number(t.amount);
    });
    const box=document.getElementById('explorerCategories');
    if(!Object.keys(byCat).length){box.innerHTML='<div class="simple-empty">Categories will become clickable once transactions exist.</div>';return}
    box.innerHTML=Object.entries(byCat).sort((a,b)=>b[1]-a[1]).slice(0,7).map(([name,value])=>
      `<button class="explorer-item" type="button" data-cat="${escapeAttr(name)}"><span>${escapeHtml(name)}</span><b>${money(value)}</b></button>`
    ).join('');
    box.querySelectorAll('.explorer-item').forEach(btn=>btn.addEventListener('click',()=>showMerchantBreakdown(btn.dataset.cat,expenses)));
    showMerchantBreakdown(Object.entries(byCat).sort((a,b)=>b[1]-a[1])[0][0],expenses);
  }

  function showMerchantBreakdown(category, expenses) {
    document.getElementById('breadcrumb').textContent=`Expenses › ${category} › Merchants`;
    const subset=expenses.filter(t=>(t.categories?.name||'Uncategorized')===category);
    const merchants={};
    subset.forEach(t=>{
      const m=t.merchant||'No merchant';
      merchants[m]=(merchants[m]||0)+Number(t.amount);
    });
    const card=document.getElementById('merchantCard');
    card.innerHTML='<div class="merchant-head"><strong>Merchant breakdown</strong><span>This month</span></div>'+
      Object.entries(merchants).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([m,v])=>`<button class="merchant-item" type="button"><span>${escapeHtml(m)}</span><b>${money(v)}</b></button>`).join('');
  }

  function renderInsight(rows,income,expenses) {
    const el=document.getElementById('insightText');
    if(!rows.length){el.textContent='Once you start adding transactions, PawBudget will automatically surface useful spending patterns here.';return}
    const categories={};
    rows.filter(t=>t.transaction_type==='expense').forEach(t=>{
      const c=t.categories?.name||'Uncategorized';
      categories[c]=(categories[c]||0)+Number(t.amount);
    });
    const top=Object.entries(categories).sort((a,b)=>b[1]-a[1])[0];
    if(top){
      const rate=income?expenses/income*100:0;
      el.innerHTML=`Your highest spending category this month is <strong>${escapeHtml(top[0])}</strong> at <strong>${money(top[1])}</strong>. ${income?`You’ve spent ${rate.toFixed(0)}% of this month’s income so far.`:''}`;
    }
  }

  // Navigation
  const navItems=[...document.querySelectorAll('.nav-item')];
  const pages=[...document.querySelectorAll('.page')];
  const sidebar=document.getElementById('sidebar');
  function openPage(name){
    navItems.forEach(x=>x.classList.toggle('active',x.dataset.page===name));
    pages.forEach(p=>p.classList.remove('active'));
    document.getElementById(`${name}-page`)?.classList.add('active');
    sidebar.classList.remove('open');
    window.scrollTo({top:0,behavior:'smooth'});
  }
  navItems.forEach(btn=>btn.addEventListener('click',()=>openPage(btn.dataset.page)));
  document.querySelectorAll('[data-page-link]').forEach(btn=>btn.addEventListener('click',()=>openPage(btn.dataset.pageLink)));
  document.getElementById('menuBtn').addEventListener('click',()=>sidebar.classList.toggle('open'));

  document.querySelectorAll('.period').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('.period').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    showToast(`${btn.textContent}: full period calculations come in the Reports step.`);
  }));

  document.getElementById('globalSearch').addEventListener('input',e=>{
    const q=e.target.value.toLowerCase();
    document.querySelectorAll('.tx-row').forEach(row=>{
      row.style.display=row.textContent.toLowerCase().includes(q)?'grid':'none';
    });
  });

  function escapeHtml(value=''){
    return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  }
  function escapeAttr(value=''){ return escapeHtml(value); }

  // Initial session + live auth changes
  db.auth.getSession().then(({data})=>{
    if(data.session) showApp(data.session);
  });

  db.auth.onAuthStateChange((event,session)=>{
    if(session && event !== 'SIGNED_OUT') {
      currentSession=session;
      authScreen.classList.add('hidden');
      appShell.classList.remove('hidden');
    }
  });
})();

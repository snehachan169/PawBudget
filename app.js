const navItems=[...document.querySelectorAll('.nav-item')];
const pages=[...document.querySelectorAll('.page')];
const sidebar=document.getElementById('sidebar');
const toast=document.getElementById('toast');
function showToast(msg){toast.textContent=msg;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),1800)}
navItems.forEach(btn=>btn.addEventListener('click',()=>{navItems.forEach(x=>x.classList.remove('active'));btn.classList.add('active');pages.forEach(p=>p.classList.remove('active'));document.getElementById(`${btn.dataset.page}-page`).classList.add('active');sidebar.classList.remove('open');window.scrollTo({top:0,behavior:'smooth'})}));
document.getElementById('menuBtn').addEventListener('click',()=>sidebar.classList.toggle('open'));
document.querySelectorAll('.period').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.period').forEach(x=>x.classList.remove('active'));btn.classList.add('active');showToast(`Dashboard period: ${btn.textContent}`)}));
document.querySelectorAll('.category-legend button').forEach(btn=>btn.addEventListener('click',()=>showToast(`${btn.dataset.cat} selected — drill-down will use live data in Step 5.`)));
document.querySelectorAll('.merchant').forEach(btn=>btn.addEventListener('click',()=>{document.getElementById('breadcrumb').textContent=`Expenses › Food › Groceries › ${btn.dataset.merchant}`;showToast(`${btn.dataset.merchant} merchant view selected.`)}));
document.querySelectorAll('.explorer-list button').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.explorer-list button').forEach(x=>x.classList.remove('selected'));btn.classList.add('selected');document.getElementById('breadcrumb').textContent=`Expenses › Food › ${btn.dataset.name}`;showToast(`${btn.dataset.name} selected.`)}));
document.getElementById('globalSearch').addEventListener('input',e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('.tx').forEach(row=>{row.style.display=row.textContent.toLowerCase().includes(q)?'grid':'none'})});
document.querySelectorAll('.link-button,.outline-button,.soft-button,.month-chip,.month-nav').forEach(btn=>btn.addEventListener('click',()=>showToast('Interactive behavior is ready for real data in the next stages.')));

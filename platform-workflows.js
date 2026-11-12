/* Independently implemented visible-page adapters; provenance: docs/PLATFORM-WORKFLOW-RESEARCH.md. */
(() => {
  const definitions = [
    ['moka', 'Moka', 'mokahr.com'],
    ['beisen', '北森', 'zhiye.com'],
    ['zhaopin', '智联校招', 'zhaopin.com'],
  ];
  function identify(value = location.href) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password) return null;
      const found = definitions.find(([, , host]) => url.hostname === host || url.hostname.endsWith('.' + host));
      return found ? { id: found[0], name: found[1] } : null;
    } catch { return null; }
  }
  const visible = el => ResumeLayout.visible(el);
  const nodes = (root, selector) => ResumeLayout.query(root, selector).filter(visible);
  const text = el => (el?.innerText || '').trim().replace(/\s+/g, ' ');
  function inspect(doc = document, value = location.href) {
    const platform = identify(value);
    if (!platform) return null;
    const path = new URL(value).pathname;
    const notices = nodes(doc, '[role="alert"],[role="dialog"],h1,h2,.status,.empty-state,.error-message');
    const loginPanel = nodes(doc, '[role="dialog"],[class*="STFormWraper"]').some(panel =>
      nodes(panel, 'input').length && nodes(panel, 'button,[role="button"]').some(button => /^(?:登录|登 录|立即登录|验证码登录|短信登录|登录\/注册)$/.test(text(button))));
    let stage = 'unknown';
    if (loginPanel || nodes(doc, 'input[type="password"],input[autocomplete="one-time-code"],.pc_qr_code').length || /\/(?:login|signin)(?:\/|$)/i.test(path + '/' + new URL(value).hash.replace(/^#/, ''))) stage = 'login';
    else if (nodes(doc, '[class*="captcha"],[id*="captcha"],[class*="geetest"],iframe[src*="challenges.cloudflare.com"]').length) stage = 'challenge';
    else if (notices.some(el => /^(?:该)?(?:职位|岗位)(?:已|已经)(?:关闭|下线|结束)|招聘已结束|job (?:is )?(?:closed|expired)/i.test(text(el)))) stage = 'closed';
    else if (notices.some(el => /投递(?:次数|数量).*(?:上限|限制)|已达.*投递上限/.test(text(el)))) stage = 'limited';
    else if (platform.id === 'zhaopin' && /\/postprocess2?(?:\/|$)/i.test(path)) stage = 'preference';
    else if (notices.some(el => /^(?:申请|投递|提交)成功[！!。\s]*$/.test(text(el)))) stage = 'complete';
    else {
      const selector = platform.id === 'beisen' ? '.ux-standard-form input:not([type="hidden"]),.ux-standard-form textarea,.ux-standard-form .phoenix-select' :
        platform.id === 'moka' ? '[class*="apply-block"] input:not([type="hidden"]),[class*="apply-block"] textarea' : 'form input:not([type="hidden"]),form textarea';
      if (nodes(doc, selector).some(el => !el.matches('[type="password"],[type="submit"],[type="button"],[type="file"]')) ||
          ResumeLayout.query(doc, 'input[type="file"]').some(input => !input.disabled && attachmentOwner(input))) stage = 'form';
      else if (nodes(doc, '.job-apply,[data-job-id]').length) stage = 'detail';
    }
    return { platform: platform.id, name: platform.name, stage, statusText: summary({name:platform.name,stage}), canFill: stage === 'form', attachmentMode: platform.id === 'zhaopin' ? 'ordinary' : 'parse-before-fill' };
  }
  function assertReady() {
    const state = inspect();
    if (state && !state.canFill) throw Error(`${summary(state)}，请在网页完成处理后重新扫描`);
  }
  function label(el) {
    if (identify()?.id !== 'beisen') return '';
    const owner = el.closest('.form-item');
    if (!owner) return '';
    const labels = nodes(owner, '.form-item__text,.form-item__title').filter(node => node.closest('.form-item') === owner);
    const values = [...new Set(labels.map(text).map(value => value.replace(/^[*\s]+|[*\s]+$/g, '')).filter(Boolean))];
    return values.length === 1 ? values[0] : '';
  }
  const sections = [['basics', /^(?:个人信息|基本信息|基本资料)$/], ['education', /^(?:教育背景|教育经历)$/], ['work', /^(?:工作经历|工作经验|实习经历)$/], ['projects', /^(?:项目经历|项目经验)$/], ['family', /^(?:家庭成员|家庭信息)$/], ['awards', /^(?:获奖经历|获奖情况)$/]];
  function moduleFor(card) {
    for (let node = card, depth = 0; node && depth < 7; node = node.parentElement, depth++) {
      const headings = nodes(node, ':scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > legend,:scope > [data-section-title],:scope > header > h2').filter(h => !h.closest('.form-item,.ux-standard-form'));
      const own = headings.filter(h => sections.some(([, pattern]) => pattern.test(text(h))));
      if (own.length === 1) return { root: node, title: text(own[0]) };
      if (headings.length) return null;
      let previous = node.previousElementSibling;
      for (let count = 0; previous && count < 4; previous = previous.previousElementSibling, count++) {
        if (previous.matches('.form-item,.ux-standard-form') || previous.querySelector('.form-item,.ux-standard-form')) break;
        const title = text(previous);
        if (visible(previous) && sections.some(([, pattern]) => pattern.test(title))) return { root: node.parentElement, title };
        if (visible(previous) && previous.matches('h1,h2,h3,h4,legend,[data-section-title]')) return null;
      }
    }
    return null;
  }
  function context(el) {
    if (identify()?.id !== 'beisen') return null;
    const card = el.closest('.ux-standard-form');
    if (!card) return null;
    const module = moduleFor(card);
    const section = module && sections.find(([, pattern]) => pattern.test(module.title))?.[0];
    if (!section || section === 'family') return { section: section || null, contextBlocked: true, context: module?.title || '北森未知区块' };
    const peers = nodes(document, '.ux-standard-form').filter(peer => {
      const other = moduleFor(peer);
      return other && sections.find(([, pattern]) => pattern.test(other.title))?.[0] === section;
    });
    if (section === 'work') {
      const local = peers.filter(peer => { const other = moduleFor(peer); return other.root === module.root && other.title === module.title; });
      return { section, context: module.title, recordIndex: null, moduleRecordIndex: local.indexOf(card), workModuleAnchor: module.root, employmentType: /^实习/.test(module.title) ? 'internship' : 'employment' };
    }
    return { section, context: module.title, recordIndex: section === 'basics' ? null : peers.indexOf(card) };
  }
  function attachmentOwner(input) {
    const platform = identify();
    const owner = platform?.id === 'beisen' ? input.closest('.form-item') : platform?.id === 'moka' ? input.closest('[class*="apply-field-"]') : null;
    if (!owner || !visible(owner) || owner.querySelectorAll('input[type="file"]').length !== 1) return null;
    const title = platform.id === 'beisen' ? label(input) : text(owner.querySelector('[class*="title-"]'));
    return /简历|\b(?:resume|cv)\b/i.test(title) && !/成绩单|证书|照片|transcript/i.test(title) ? { owner, label: title } : null;
  }
  function controlGuard(el) {
    if (identify()?.id !== 'beisen') return assertReady;
    const identity = () => JSON.stringify([label(el), ...['aria-label','aria-labelledby','name','id','type','placeholder'].map(name => el.getAttribute(name))]);
    const before = identity(), card = el.closest('.ux-standard-form'), module = card && moduleFor(card);
    return () => {
      assertReady();
      const currentCard = el.closest('.ux-standard-form'), currentModule = currentCard && moduleFor(currentCard);
      if (before !== identity() || currentCard !== card || currentModule?.root !== module?.root || currentModule?.title !== module?.title)
        throw Error('北森字段或区块语义已变化，请重新扫描核对');
    };
  }
  function summary(state) {
    if (!state) return '';
    const stages = { form: '简历表单', login: '请先登录', challenge: '请处理验证码', closed: '职位已关闭', limited: '投递受限', preference: '请在网页确认志愿', complete: '网页提示提交成功', detail: '请进入简历表单', unknown: '请进入简历表单' };
    return state.name + ' · ' + stages[state.stage];
  }
  globalThis.ResumePlatforms = { identify, inspect, assertReady, label, context, attachmentOwner, summary, controlGuard };
})();

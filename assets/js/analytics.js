/* =====================================================================
   PostHog Analytics — Nimbus Tech Solutions
   Replace POSTHOG_API_KEY with your actual key from posthog.com
   ===================================================================== */

// PostHog snippet (async, non-blocking)
!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","").replace("us","us-assets").replace("eu","eu-assets")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+" (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify alias people.set people.set_once group resetGroups setPersonProperties".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

posthog.init('phc_REPLACE_WITH_YOUR_POSTHOG_API_KEY', {
  api_host: 'https://us.i.posthog.com',
  person_profiles: 'identified_only',
  capture_pageview: true,       // auto page view on load
  capture_pageleave: true,      // track bounce / time on page
});

// ── Event tracking (runs after DOM is ready) ──────────────────────────
document.addEventListener('DOMContentLoaded', function () {

  // Helper: get the closest section id for a given element
  function getSectionId(el) {
    var section = el.closest('section[id], header[id], footer[id]');
    return section ? section.id : 'unknown';
  }

  // ── CTA / nav buttons ──────────────────────────────────────────────
  var ctaSelectors = [
    '.btn-hero-primary',
    '.cta-btn-primary',
    '.cta-btn-outline',
    '.sg-cta',
    '.pricing-cta',
    '.getstarted',
    'a.scrollto[href="#contact"]',
    '.cloud-modal-trigger',
  ];

  document.querySelectorAll(ctaSelectors.join(', ')).forEach(function (el) {
    el.addEventListener('click', function () {
      posthog.capture('cta_clicked', {
        button_text: el.innerText.trim(),
        section: getSectionId(el),
        href: el.getAttribute('href') || '',
        classes: el.className,
      });
    });
  });

  // ── Nav "Free Strategy Call" ───────────────────────────────────────
  var navCta = document.querySelector('.nav-item a.getstarted, header a.getstarted');
  if (navCta) {
    navCta.addEventListener('click', function () {
      posthog.capture('nav_cta_clicked', { button_text: navCta.innerText.trim() });
    });
  }

  // ── Cloud unlock form (easter-egg modal) ──────────────────────────
  var cloudForm = document.getElementById('cloud-unlock-form');
  if (cloudForm) {
    cloudForm.addEventListener('submit', function () {
      posthog.capture('form_submitted', {
        form_id: 'cloud-unlock-form',
        form_name: 'Cloud Burst Consultation',
      });
    });
  }

  // ── Any other <form> on the page ─────────────────────────────────
  document.querySelectorAll('form:not(#cloud-unlock-form)').forEach(function (form) {
    form.addEventListener('submit', function () {
      posthog.capture('form_submitted', {
        form_id: form.id || 'unnamed',
        form_name: form.getAttribute('aria-label') || form.id || 'Contact Form',
        page: window.location.pathname,
      });
    });
  });

  // ── Outbound link clicks ───────────────────────────────────────────
  document.querySelectorAll('a[href^="http"], a[href^="mailto"], a[href^="tel"]').forEach(function (link) {
    link.addEventListener('click', function () {
      var href = link.getAttribute('href');
      // Skip internal Formspree/PostHog endpoints
      if (href.includes('formspree.io') || href.includes('posthog.com')) return;
      posthog.capture('outbound_link_clicked', {
        url: href,
        text: link.innerText.trim(),
        section: getSectionId(link),
      });
    });
  });

  // ── Blog article reads (only on /blog/ pages) ─────────────────────
  if (window.location.pathname.includes('/blog/')) {
    var articleTitle = document.querySelector('h1');
    if (articleTitle) {
      posthog.capture('blog_article_viewed', {
        title: articleTitle.innerText.trim(),
        slug: window.location.pathname,
      });
    }

    // Track scroll-to-end (article completion)
    var completed = false;
    window.addEventListener('scroll', function () {
      if (completed) return;
      var scrolled = window.scrollY + window.innerHeight;
      var total = document.documentElement.scrollHeight;
      if (scrolled / total >= 0.85) {
        completed = true;
        posthog.capture('blog_article_completed', {
          title: articleTitle ? articleTitle.innerText.trim() : '',
          slug: window.location.pathname,
        });
      }
    }, { passive: true });
  }

});

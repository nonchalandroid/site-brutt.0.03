(() => {
  const measurementId = "G-QQ9M5LFDWR";
  const optOut = "ga-disable-" + measurementId;
  if (location.hostname !== "tabacariabrutt.com.br" ||
      navigator.globalPrivacyControl === true || navigator.doNotTrack === "1" ||
      window[optOut] === true) return;

  const interactions = new AbortController();
  const options = { capture: true, passive: true, signal: interactions.signal };
  const pageLocation = document.querySelector('link[rel="canonical"]')?.href ||
    location.origin + location.pathname;

  function start(event) {
    if (!event.isTrusted) return;
    interactions.abort();
    if (window[optOut] === true || document.getElementById("brutt-google-tag")) return;

    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    gtag("consent", "default", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied"
    });
    gtag("js", new Date());
    gtag("config", measurementId, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      page_location: pageLocation,
      page_referrer: document.referrer ? new URL(document.referrer).origin : ""
    });

    const script = document.createElement("script");
    script.id = "brutt-google-tag";
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + measurementId;
    document.head.append(script);
  }

  for (const type of ["pointerup", "keydown", "wheel"]) {
    window.addEventListener(type, start, options);
  }
})();

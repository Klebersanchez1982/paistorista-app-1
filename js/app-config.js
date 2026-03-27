const MAPS_KEYS_BY_HOST = {
  localhost: "AIzaSyBH7hhgt206uwd-Ogajk7AWPmFwRDmoSJA",
  "127.0.0.1": "AIzaSyBH7hhgt206uwd-Ogajk7AWPmFwRDmoSJA",
  "klebersanchez1982.github.io": "AIzaSyBH7hhgt206uwd-Ogajk7AWPmFwRDmoSJA"
};

export function getEnvironmentName(hostname = window.location.hostname) {
  if (hostname === "localhost" || hostname === "127.0.0.1") return "local";
  if (hostname === "klebersanchez1982.github.io") return "producao";
  return "desconhecido";
}

export function getMapsApiKey(hostname = window.location.hostname) {
  return MAPS_KEYS_BY_HOST[hostname] || "";
}

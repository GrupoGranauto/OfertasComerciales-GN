// =========================
// AUTH (Google Sign-In) — SIMPLE (solo dominio)
// IMPORTANTE: el callback debe existir en window ANTES de que Google lo use.
// =========================
const LS_TOKEN_KEY = "ga_id_token";
const LS_USER_KEY = "ga_user";

function getToken() {
  return localStorage.getItem(LS_TOKEN_KEY) || "";
}
function setToken(token) {
  if (!token) localStorage.removeItem(LS_TOKEN_KEY);
  else localStorage.setItem(LS_TOKEN_KEY, token);
}
function setCachedUser(user) {
  if (!user) localStorage.removeItem(LS_USER_KEY);
  else localStorage.setItem(LS_USER_KEY, JSON.stringify(user));
}
function getCachedUser() {
  try {
    const raw = localStorage.getItem(LS_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ✅ Callback global que Google Identity llama (por data-callback)
window.handleCredentialResponse = async function (response) {
  try {
    const idToken = response?.credential;
    if (!idToken) throw new Error("No credential");

    setToken(idToken);

    const res = await fetch("/api/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${idToken}`,
        Accept: "application/json",
      },
    });

    const me = await res.json().catch(() => ({}));

    if (!res.ok) {
      setToken("");
      setCachedUser(null);

      const msg =
        me?.error ||
        (res.status === 403
          ? "Dominio no permitido. Usa tu cuenta @grupogranauto.mx"
          : "No autorizado. Verifica tu cuenta.");
      alert(msg);
      return;
    }

    setCachedUser(me);

    // Simple: recarga para re-render y desbloqueo
    location.reload();
  } catch (err) {
    console.error("handleCredentialResponse error:", err);
    setToken("");
    setCachedUser(null);
    alert("No autorizado. Usa tu cuenta @grupogranauto.mx");
  }
};

document.addEventListener("DOMContentLoaded", () => {
  // =========================
  // ELEMENTOS (Ofertas) — DECLARAR PRIMERO
  // =========================
  const inputVIN = document.getElementById("vin-input");
  const buttonSearch = document.getElementById("btn-buscar");

  const resultsSection = document.querySelector("#results");
  const resultsContent = document.querySelector(".results-content");
  const noResultsBox = document.querySelector(".no-results");
  const mainTitle = document.querySelector(".main-offer-title");
  const mainDescription = document.querySelector(".main-offer-description");
  const otherOffersGrid = document.querySelector(".other-offers-grid");
  const statusEl = document.querySelector(".status-cliente");

  if (!inputVIN || !buttonSearch) return;

  // =========================
  // ELEMENTOS AUTH UI
  // =========================
  const authModal = document.getElementById("auth-modal");
  const appWrap = document.getElementById("app-wrap");
  const btnLogout = document.getElementById("btn-logout");
  const userNameEl = document.getElementById("user-name");
  const userEmailEl = document.getElementById("user-email");
  const userAvatarEl = document.getElementById("user-avatar");
  const permHint = document.getElementById("perm-hint");

  function openAuthModal() {
    authModal?.classList.remove("hidden");
    appWrap?.classList.add("blur-on");
  }
  function closeAuthModal() {
    authModal?.classList.add("hidden");
    appWrap?.classList.remove("blur-on");
  }

  function setAppLocked(locked) {
    inputVIN.disabled = locked;
    buttonSearch.disabled = locked;
    permHint?.classList.toggle("hidden", !locked);

    if (locked) openAuthModal();
    else closeAuthModal();
  }

  function applyUserUI(me) {
    const loggedIn = !!me;

    if (userNameEl) {
      userNameEl.textContent = loggedIn ? (me.name || "Usuario") : "";
      userNameEl.classList.toggle("hidden", !loggedIn);
    }
    if (userEmailEl) {
      userEmailEl.textContent = loggedIn ? (me.email || "") : "";
      userEmailEl.classList.toggle("hidden", !loggedIn);
    }
    if (userAvatarEl) {
      if (loggedIn && me.picture) {
        userAvatarEl.src = me.picture;
        userAvatarEl.classList.remove("hidden");
      } else {
        userAvatarEl.removeAttribute("src");
        userAvatarEl.classList.add("hidden");
      }
    }

    btnLogout?.classList.toggle("hidden", !loggedIn);
    setAppLocked(!loggedIn);
  }

  async function authFetch(url, options = {}) {
    const token = getToken();
    const headers = new Headers(options.headers || {});
    headers.set("Accept", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const res = await fetch(url, { ...options, headers });

    if (res.status === 401 || res.status === 403) {
      setToken("");
      setCachedUser(null);
      applyUserUI(null);
    }

    return res;
  }

  async function loadMe() {
    const token = getToken();
    if (!token) {
      setCachedUser(null);
      applyUserUI(null);
      return null;
    }

    try {
      const res = await authFetch("/api/me", { method: "GET" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const me = await res.json();
      setCachedUser(me);
      applyUserUI(me);
      return me;
    } catch {
      setToken("");
      setCachedUser(null);
      applyUserUI(null);
      return null;
    }
  }

  // Logout
  btnLogout?.addEventListener("click", () => {
    setToken("");
    setCachedUser(null);
    location.reload();
  });

  // =========================
  // TU CÓDIGO (Ofertas)
  // =========================
  const OFERTA_DESCRIPCIONES = {
    "aceleracion primer servicio":
      "Contacta al cliente con urgencia por perder garantía. Ofrece Reactivación de garantía al realizar su servicio. Código: REACTIVACION.",
    inactivos:
      "Recupera clientes con una oferta de entrada: Servicio VA $1,699 o Cambio de Aceite VA $999. Código: OFERTALLER.",
    "retenidos en riesgo":
      "Motiva una visita con la Revisión de 27 puntos + Cupón $500 para reparaciones. Código: OFERTALLER.",
    "servicio a tu puerta":
      "Ofrece recolección y entrega del vehículo como valor agregado. Incentivo: $100 al distribuidor. Código: VALETPARKING.",
    "leales fuera garantia":
      "Recompensa su lealtad con Servicio VA $1,699 y promueve upselling de mantenimientos. Código: OFERTALLER.",
    "primer servicio":
      "Invita al cliente a realizar su primer servicio y conservar la garantía. Beneficio: Tarjeta Amazon $500. Código: OFERTALLER.",
  };

  const OFERTA_IMAGENES = {
    "aceleracion primer servicio": "./images/aceleracion_ps.png",
    inactivos: "./images/Inactivos.png",
    "retenidos en riesgo": "./images/retencion.png",
    "leales fuera garantia": "./images/leales_fg.png",
    "primer servicio": "./images/primer_servicio.png",
  };

  function normalizarTexto(txt) {
    return String(txt || "")
      .replace(/_/g, " ")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ");
  }

  function formatearNombreOferta(nombre) {
    const s = normalizarTexto(nombre);
    if (!s) return "";
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function getDescripcionOferta(nombre) {
    const key = normalizarTexto(nombre);
    if (OFERTA_DESCRIPCIONES[key]) return OFERTA_DESCRIPCIONES[key];
    for (const [pattern, desc] of Object.entries(OFERTA_DESCRIPCIONES)) {
      if (key.includes(pattern) || pattern.includes(key)) return desc;
    }
    return "";
  }

  function getImagenOferta(nombre) {
    const key = normalizarTexto(nombre);
    if (OFERTA_IMAGENES[key]) return OFERTA_IMAGENES[key];
    for (const [pattern, img] of Object.entries(OFERTA_IMAGENES)) {
      if (key.includes(pattern) || pattern.includes(key)) return img;
    }
    return "./images/default.png";
  }

  function getLeyendaStatusCliente(rawStatus) {
    const s = String(rawStatus || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .trim();

    if (s === "ASISTIO") return "Ya asistió";
    if (s === "POTENCIAL") return "Potencial";
    return "";
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatearCodigo(texto) {
    if (!texto) return "";
    return texto.replace(
      /C[oó]digo:\s*([A-Z0-9]+)/gi,
      (_, codigo) => `Código: <code class="codigo-oferta">${codigo}</code>`
    );
  }

  function setLoading(isLoading) {
    if (!inputVIN.disabled) buttonSearch.disabled = isLoading;
    buttonSearch.textContent = isLoading ? "Buscando..." : "Buscar Ofertas";
  }

  function validateVIN(v) {
    const vin = (v || "").trim().toUpperCase();
    if (!vin) return { ok: false, msg: "Ingrese un VIN." };
    if (vin.length !== 17) return { ok: false, msg: "El VIN debe tener 17 caracteres." };
    if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin)) return { ok: false, msg: "VIN inválido." };
    return { ok: true, vin };
  }

  function renderResults(data) {
    resultsSection?.classList.remove("hidden");
    resultsContent?.classList.remove("hidden");
    noResultsBox?.classList.add("hidden");

    const nombrePrincipalRaw = data?.oferta_principal || "";
    const nombrePrincipalUI = formatearNombreOferta(nombrePrincipalRaw);
    const descPrincipal = getDescripcionOferta(nombrePrincipalRaw);

    const imgOferta = document.querySelector(".offer-image-img");
    if (imgOferta) imgOferta.src = getImagenOferta(nombrePrincipalRaw);

    if (mainTitle) mainTitle.textContent = nombrePrincipalUI || "Sin información";

    if (mainDescription) {
      mainDescription.innerHTML =
        formatearCodigo(descPrincipal) || "No hay descripción disponible para esta oferta.";
    }

    if (statusEl) {
      const leyenda = getLeyendaStatusCliente(data?.status_cliente_principal);
      if (leyenda) {
        statusEl.textContent = leyenda;
        statusEl.classList.remove("hidden");
      } else {
        statusEl.textContent = "";
        statusEl.classList.add("hidden");
      }
    }

    if (!otherOffersGrid) return;
    otherOffersGrid.innerHTML = "";

    if (Array.isArray(data?.ofertas)) {
      data.ofertas.forEach((nombreOfertaRaw) => {
        const card = document.createElement("div");
        card.className = "p-4 @container";

        card.innerHTML = `
          <div class="card-secondary flex flex-col rounded-xl shadow border">
            <img src="${getImagenOferta(nombreOfertaRaw)}" class="offer-secondary-img" alt="Imagen Oferta">
            <div class="p-6">
              <p class="text-lg font-bold">${escapeHtml(formatearNombreOferta(nombreOfertaRaw))}</p>
              <p class="text-base mt-1">
                ${formatearCodigo(getDescripcionOferta(nombreOfertaRaw) || "Oferta adicional disponible.")}
              </p>
            </div>
          </div>
        `;
        otherOffersGrid.appendChild(card);
      });
    }
  }

  function showNoResults(message) {
    resultsSection?.classList.remove("hidden");
    resultsContent?.classList.add("hidden");
    if (noResultsBox) {
      noResultsBox.classList.remove("hidden");
      const text = noResultsBox.querySelector(".no-results-text");
      if (text) text.textContent = message || "";
    }
  }

  async function buscar() {
    if (inputVIN.disabled) {
      openAuthModal();
      return;
    }

    const { ok, msg, vin } = validateVIN(inputVIN.value);
    if (!ok) return showNoResults(msg);

    setLoading(true);
    try {
      const res = await authFetch(`/api/ofertas?vin=${encodeURIComponent(vin)}`, { method: "GET" });

      if (res.status === 404) {
        const j = await res.json().catch(() => ({}));
        return showNoResults(j.message || "No se encontraron ofertas para el VIN.");
      }

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        return showNoResults(j.error || "Ocurrió un error al consultar las ofertas.");
      }

      const data = await res.json();
      if (!data?.found) return showNoResults("No se encontraron ofertas para el VIN.");

      renderResults(data);
    } catch {
      showNoResults("Ocurrió un error al consultar las ofertas.");
    } finally {
      setLoading(false);
    }
  }

  buttonSearch.addEventListener("click", buscar);
  inputVIN.addEventListener("keydown", (e) => {
    if (e.key === "Enter") buscar();
  });

  // =========================
  // INIT AUTH
  // =========================
  const cached = getCachedUser();
  if (!getToken()) {
    applyUserUI(null);
  } else if (cached) {
    applyUserUI(cached);
    loadMe();
  } else {
    loadMe();
  }
});
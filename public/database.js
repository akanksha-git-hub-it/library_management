(function () {
  const API_ENDPOINT = "/api/library-state";
  let activeBackend = "mongodb";

  function canUseRemoteApi() {
    return window.location.protocol !== "file:";
  }

  function assertRemoteApiAvailable() {
    if (!canUseRemoteApi()) {
      throw new Error("Open the app through the Node server so it can use MongoDB.");
    }
  }

  async function load(defaultState, normalizeState) {
    assertRemoteApiAvailable();

    const response = await fetch(API_ENDPOINT, {
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      throw new Error(`MongoDB API returned ${response.status}`);
    }

    const payload = await response.json();
    activeBackend = "mongodb";
    return normalizeState(payload.state || defaultState);
  }

  async function save(state) {
    assertRemoteApiAvailable();

    const response = await fetch(API_ENDPOINT, {
      method: "PUT",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ state })
    });

    if (!response.ok) {
      throw new Error(`MongoDB API returned ${response.status}`);
    }

    activeBackend = "mongodb";
  }

  window.LibraryDatabase = {
    getBackend: () => activeBackend,
    load,
    save
  };
})();

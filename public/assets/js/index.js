document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("university-search");
  const cityPills = document.querySelectorAll(".city-pill");
  const cards = document.querySelectorAll("#university-grid .university-card");
  const emptyState = document.getElementById("university-empty");
  if (!searchInput || !cards.length) return;

  let activeCity = "all";

  const applyFilter = () => {
    const query = searchInput.value.trim().toLowerCase();
    let visibleCount = 0;
    cards.forEach((card) => {
      const matchesCity = activeCity === "all" || card.dataset.city === activeCity;
      const matchesSearch = !query || card.textContent.toLowerCase().includes(query);
      const show = matchesCity && matchesSearch;
      card.style.display = show ? "" : "none";
      if (show) visibleCount++;
    });
    if (emptyState) emptyState.hidden = visibleCount !== 0;
  };

  searchInput.addEventListener("input", applyFilter);
  cityPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      cityPills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      activeCity = pill.dataset.city;
      applyFilter();
    });
  });
});

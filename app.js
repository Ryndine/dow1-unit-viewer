(() => {
  "use strict";

  const data = window.DOW_DATA;
  const query = (selector) => document.querySelector(selector);
  const unitList = query("#list");
  const unitPage = query("#detail");
  const searchInput = query("#search");
  const raceBar = query("#races");
  const viewSwitch = query("#view-switch");
  const themeToggle = query("#theme-toggle");

  const THEME_STORAGE_KEY = "unit-breakdown-theme";
  function readStoredTheme() {
    try { return localStorage.getItem(THEME_STORAGE_KEY); } catch { return null; }
  }
  function storeTheme(theme) {
    try { localStorage.setItem(THEME_STORAGE_KEY, theme); return true; } catch { return false; }
  }
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const otherTheme = theme === "dark" ? "light" : "dark";
    themeToggle.textContent = `${otherTheme} mode`;
    themeToggle.setAttribute("aria-label", `Switch to ${otherTheme} mode`);
  }
  function toggleTheme() {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(theme);
    storeTheme(theme);
  }
  applyTheme(readStoredTheme() === "light" ? "light" : "dark");
  themeToggle.addEventListener("click", toggleTheme);

  if (!data || !data.races || !data.races.length) {
    unitPage.innerHTML = `<p class="empty-state">No data found. Run <code>python tools/build_viewer_data.py</code> to create <code>viewer/data.js</code>.</p>`;
    return;
  }

  const HTML_ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const escapeHtml = (text) => String(text ?? "").replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]);
  const formatNumber = (value, decimals = 1) => (value === null || value === undefined || value === ""
    ? "—" : Number(value).toLocaleString("en-US", { maximumFractionDigits: decimals }));
  const formatSeconds = (value) => (value ? `${formatNumber(value)} s` : "—");
  const formatPercent = (fraction) => (fraction ? `${Math.round(fraction * 100)}%` : "—");

  const resourcesSpent = (cost) => [[cost.req, "req"], [cost.power, "power"]].filter(([amount]) => amount);
  const formatCost = (cost) => resourcesSpent(cost).map(([amount, resource]) => `${formatNumber(amount)} ${resource}`).join(" · ") || "Free";
  const formatCostWithUnits = (cost) => resourcesSpent(cost)
    .map(([amount, resource]) => `${formatNumber(amount)}<small>${resource}</small>`).join(" ") || "Free";
  const formatCostAsReqThenPower = (cost) => (cost.power
    ? `${cost.req ? formatNumber(cost.req) : "—"} · ${formatNumber(cost.power)}`
    : cost.req ? formatNumber(cost.req) : "Free");

  const isControlHint = (line) => /^(left|right)-click|hotkey/i.test(line);
  const descriptionLines = (description) => (description || "").split(" / ")
    .map((line) => line.replace(/^-\s*/, "").trim())
    .filter((line) => line && !isControlHint(line));
  const renderDescription = (description) => {
    const lines = descriptionLines(description);
    if (!lines.length) return "";
    return lines.length === 1 ? `<p class="description">${escapeHtml(lines[0])}</p>`
      : `<ul class="description bullet-list">${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`;
  };
  const renderBulletList = (items) => (items.length
    ? `<ul class="bullet-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "");
  const renderChip = (text, kind = "") => `<span class="chip">${kind ? `<b>${escapeHtml(kind)}</b>` : ""}${escapeHtml(text)}</span>`;
  const renderChipRow = (label, chips) => (chips.length
    ? `<div class="chip-row"><span class="chip-row-label">${label}</span>${chips.join("")}</div>` : "");
  const renderRequirements = (requirements) => renderChipRow("Requires",
    requirements.map((requirement) => renderChip(requirement.text, requirement.kind)));
  const renderSection = (title, subtitle, body) => `<section><div class="section-divider"><span></span></div>
    <div class="section-head"><h3>${title}</h3>${
    subtitle ? `<p>${subtitle}</p>` : ""}</div>${body}</section>`;
  const renderEmptySection = (title) => renderSection(title, "", `<p class="empty-state">None</p>`);
  const renderTable = (headerRows, bodyRows, className = "") => `<div class="table-wrap"><table class="${className}">
    <thead>${headerRows}</thead><tbody>${bodyRows}</tbody></table></div>`;

  const UNIT_TYPE_SENTENCES = [
    [/^greater daemon$/i, ["Greater daemon"]],
    [/^daemon$/i, ["Daemon"]],
    [/^greater beast$/i, ["Greater beast"]],
    [/^beast$/i, ["Beast"]],
    [/^heavy infantry( battlesuit)?$/i, ["Heavy infantry"]],
    [/^(infantry|infantry unit|infantry light battlesuit|counts as infantry)$/i, ["Infantry"]],
    [/^walker vehicle$/i, ["Walker"]],
    [/^(vehicle|light vehicle|medium vehicle|heavy vehicle|assault vehicle|anti-infantry vehicle|ultimate vehicle|counts as vehicle)$/i, ["Vehicle"]],
    [/^(tank|heavy tank)$/i, ["Tank"]],
    [/^transport tank$/i, ["Transport", "Tank"]],
    [/^artillery tank$/i, ["Artillery", "Tank"]],
    [/^heavy artillery$/i, ["Artillery"]],
    [/^(transport|transport unit|heavy transport)$/i, ["Transport"]],
    [/^infiltration unit$/i, ["Infiltrator"]],
    [/^builder unit$/i, ["Builder"]],
    [/^healer unit$/i, ["Healer"]],
    [/^support unit$/i, ["Support"]],
    [/^support\/siege unit$/i, ["Support", "Siege"]],
    [/^siege$/i, ["Siege"]],
    [/^scout$/i, ["Scout"]],
    [/^scout\/recon\/sniper unit$/i, ["Scout", "Sniper"]],
    [/^ambush unit$/i, ["Ambush"]],
    [/^elite squad$/i, ["Elite"]],
  ];
  const UNIT_CLASS_KEYWORDS = new Set(["Infantry", "Heavy infantry", "Vehicle", "Walker", "Tank", "Daemon",
    "Greater daemon", "Beast", "Greater beast"]);
  const SENTENCES_SHOWN_ELSEWHERE = [
    /^commander unit\.?\s*(\((primary|secondary)\))?$/i,
    /^\((primary|secondary)\)$/i,
    /^infantry commander$/i,
    /^detects infiltrated units$/i,
    /^can use infiltration/i,
    /^can transport infantry( units)?$/i,
    /^no weaponry$/i,
    /^can (be upgraded|upgrade|be equipped)\b/i,
  ];
  const STRONG_AGAINST_SENTENCE = /^(?:(?:very|highly|most|default weaponry is)\s+)?effective (?:against|vs\.?) (.+)$/i;
  const STRONG_AGAINST_TARGETS = [
    [/^all unit types|^all units/, "All units"], [/^most unit types|^most units/, "Most units"],
    [/^heavy infantry/, "Heavy infantry"], [/^infantry/, "Infantry"], [/^(vehicles?|tanks?)/, "Vehicles"],
    [/^(buildings?|structures?)/, "Buildings"], [/^commanders?/, "Commanders"], [/^monsters?/, "Monsters"],
    [/^daemons?/, "Daemons"], [/^(aircraft|air units|fliers)/, "Aircraft"],
  ];
  const ARMOUR_CLASS_KEYWORD = [["Heavy infantry", "Heavy infantry"], ["Infantry", "Infantry"], ["Vehicle", "Vehicle"],
    ["Monster", "Monster"], ["Air", "Aircraft"]];

  const sentencesOf = (description) => descriptionLines(description)
    .flatMap((line) => line.split(/(?<=\.)\s+(?=[A-Z(])/))
    .map((sentence) => sentence.trim().replace(/\.$/, ""))
    .filter(Boolean);

  function strongAgainstTargets(targetText) {
    const targets = [];
    let rest = targetText.toLowerCase();
    while (rest) {
      const match = STRONG_AGAINST_TARGETS.find(([pattern]) => pattern.test(rest));
      if (match) {
        if (!targets.includes(match[1])) targets.push(match[1]);
        rest = rest.replace(match[0], "");
      } else if (/^(\s|,|and\b|&)/.test(rest)) {
        rest = rest.replace(/^(\s+|,|and\b|&)/, "");
      } else {
        break;
      }
    }
    return { targets, remainder: rest.replace(/^[\s,]+/, "") };
  }

  const capitalizedSentence = (text) => `${text.charAt(0).toUpperCase()}${text.slice(1)}${/[.!?]$/.test(text) ? "" : "."}`;

  function readUnitDescription(unit) {
    const typeKeywords = [];
    const strongAgainst = [];
    const flavour = [];
    for (const sentence of sentencesOf(unit.desc)) {
      const typeMatch = UNIT_TYPE_SENTENCES.find(([pattern]) => pattern.test(sentence));
      const strongAgainstMatch = sentence.match(STRONG_AGAINST_SENTENCE);
      if (typeMatch) {
        typeKeywords.push(...typeMatch[1]);
      } else if (SENTENCES_SHOWN_ELSEWHERE.some((pattern) => pattern.test(sentence))) {
        continue;
      } else if (strongAgainstMatch) {
        const { targets, remainder } = strongAgainstTargets(strongAgainstMatch[1]);
        strongAgainst.push(...targets.filter((target) => !strongAgainst.includes(target)));
        if (!targets.length || remainder) flavour.push(capitalizedSentence(sentence));
      } else {
        flavour.push(capitalizedSentence(sentence));
      }
    }
    return { typeKeywords, strongAgainst, flavour: flavour.join(" ") };
  }

  function unitKeywords(unit, typeKeywords) {
    const { builder, transportSlots, jumps, infiltrates } = unit.capabilities;
    const capabilityKeywords = [builder && "Builder", transportSlots && "Transport", jumps && "Jump", infiltrates && "Infiltrator"];
    const armourClass = ARMOUR_CLASS_KEYWORD.find(([armourPrefix]) => trooperOf(unit).armour.startsWith(armourPrefix));
    const classKeywords = typeKeywords.filter((keyword) => UNIT_CLASS_KEYWORDS.has(keyword));
    const roleKeywords = typeKeywords.filter((keyword) => !UNIT_CLASS_KEYWORDS.has(keyword));
    const classOrArmour = classKeywords.length || !armourClass ? classKeywords : [armourClass[1]];
    return [...new Set([...capabilityKeywords, ...classOrArmour, ...roleKeywords].filter(Boolean))];
  }

  const trooperOf = (unit) => unit.models[0];
  const isStandaloneCommander = (unit) => unit.role === "commander";
  const isAttachable = (unit) => unit.role === "attach";
  const isStackedLayout = () => matchMedia("(max-width: 860px)").matches;

  let currentRace = data.races[0];
  let currentUnit = null;
  let currentSpell = null;
  const lastViewedUnitIdByRace = {};
  const MATCHUP_HASH_PREFIX = "matchup/";
  let currentView = "units";
  let opponentRace = null;
  let enemyScope = "arrival";
  const economyAssumptions = { points: 4, listeningPosts: 2, generators: 2 };

  const formatSpellCost = (cost) => Object.entries(cost)
    .map(([resource, amount]) => `${formatNumber(amount)} ${resource}`).join(" · ") || "Free";
  const isCurrentListItem = (button) => (button.dataset.spell
    ? Boolean(currentSpell) && button.dataset.spell === currentSpell.id
    : !currentSpell && Boolean(currentUnit) && button.dataset.id === currentUnit.id);
  const markCurrentListItem = () => unitList.querySelectorAll(".unit-btn")
    .forEach((button) => button.setAttribute("aria-current", isCurrentListItem(button)));

  function renderSpellList(spells) {
    if (!spells.length) return "";
    return `<p class="group-label spells">Spells</p>${spells.map((spell) => `<button class="unit-btn"
      data-spell="${escapeHtml(spell.id)}" aria-current="false"><span>${escapeHtml(spell.name)}<span class="tier-tag">T${spell.tier}</span></span>
      <span class="cost">${formatSpellCost(spell.cost)}</span></button>`).join("")}`;
  }

  function renderUnitList() {
    const searchText = searchInput.value.trim().toLowerCase();
    const matchesSearch = (unit) => [unit.name, unit.group, unit.kind, unit.origin]
      .some((field) => field.toLowerCase().includes(searchText));
    const units = currentRace.units.filter((unit) => !searchText || matchesSearch(unit));
    const spells = currentView === "units"
      ? currentRace.spells.filter((spell) => !searchText || spell.name.toLowerCase().includes(searchText)) : [];
    if (!units.length && !spells.length) {
      unitList.innerHTML = `<p class="empty-state">No units match “${escapeHtml(searchInput.value)}”.</p>`;
      return;
    }
    let html = renderSpellList(spells);
    let group = null;
    let subgroup = null;
    for (const unit of units) {
      if (unit.group !== group) {
        group = unit.group;
        subgroup = null;
        html += `<p class="group-label${unit.role ? " commanders" : ""}">${escapeHtml(group)}</p>`;
      }
      if (unit.role && unit.kind !== subgroup) {
        subgroup = unit.kind;
        html += `<p class="subgroup-label">${escapeHtml(subgroup)}</p>`;
      }
      const tierTag = unit.role ? `<span class="tier-tag">T${unit.tier}</span>` : "";
      html += `<button class="unit-btn" data-id="${escapeHtml(unit.id)}" aria-current="false">
        <span>${escapeHtml(unit.name)}${tierTag}</span>
        <span class="cost" title="${escapeHtml(formatCost(unit.cost))}">${formatCostAsReqThenPower(unit.cost)}</span></button>`;
    }
    unitList.innerHTML = html;
    markCurrentListItem();
  }

  function scrollToOpenedPage(openedFromList) {
    if (openedFromList && isStackedLayout()) unitPage.scrollIntoView();
    else window.scrollTo(0, 0);
  }

  function showUnit(unitId, openedFromList = false) {
    const raceWithUnit = data.races.find((race) => race.units.some((unit) => unit.id === unitId));
    if (raceWithUnit && raceWithUnit !== currentRace) showRace(raceWithUnit);
    currentSpell = null;
    currentUnit = currentRace.units.find((unit) => unit.id === unitId) || currentRace.units[0];
    lastViewedUnitIdByRace[currentRace.id] = currentUnit.id;
    delete unitPage.dataset.update;
    markCurrentListItem();
    refreshPage();
    scrollToOpenedPage(openedFromList);
  }

  const raceWithSpell = (spellId) => data.races.find((race) => race.spells.some((spell) => spell.id === spellId));

  function showSpell(spellId, openedFromList = false) {
    const race = raceWithSpell(spellId);
    if (race !== currentRace) showRace(race);
    currentSpell = currentRace.spells.find((spell) => spell.id === spellId);
    if (!currentRace.units.includes(currentUnit)) {
      currentUnit = currentRace.units.find((unit) => unit.id === lastViewedUnitIdByRace[currentRace.id]) || currentRace.units[0];
    }
    delete unitPage.dataset.update;
    markCurrentListItem();
    refreshPage();
    scrollToOpenedPage(openedFromList);
  }

  const openListItem = (button, openedFromList) => (button.dataset.spell
    ? showSpell(button.dataset.spell, openedFromList) : showUnit(button.dataset.id, openedFromList));

  function refreshPage() {
    if (currentView === "matchups") {
      opponentRace = opponentRace || data.races.find((race) => race !== currentRace) || currentRace;
      unitPage.innerHTML = renderMatchupPage(currentUnit, opponentRace);
      history.replaceState(null, "", `#${MATCHUP_HASH_PREFIX}${currentUnit.id}/${opponentRace.id}`);
      document.title = `${currentUnit.name} vs ${opponentRace.name}`;
    } else if (currentSpell) {
      unitPage.innerHTML = renderSpellPage(currentSpell);
      history.replaceState(null, "", `#${currentSpell.id}`);
      document.title = `${currentSpell.name} · ${currentRace.name}`;
    } else {
      unitPage.innerHTML = renderUnitPage(currentUnit);
      history.replaceState(null, "", `#${currentUnit.id}`);
      document.title = `${currentUnit.name} · ${currentRace.name}`;
    }
  }

  function showView(view) {
    currentView = view;
    if (view === "matchups") currentSpell = null;
    viewSwitch.querySelectorAll("[data-view]").forEach((button) => button.setAttribute("aria-pressed", button.dataset.view === view));
    renderUnitList();
    refreshPage();
  }

  function showRace(race) {
    currentRace = race;
    document.body.dataset.race = race.id;
    raceBar.querySelectorAll(".race-btn").forEach((button) => button.setAttribute("aria-pressed", button.dataset.race === race.id));
    query("#subtitle").textContent = `${race.name} · ${race.units.length} units`;
    renderUnitList();
    unitList.scrollTop = 0;
  }

  function renderUnitPage(unit) {
    return [renderHeader(unit), renderStatCard(unit), renderModelsTable(unit), renderWeaponsTable(unit),
      renderDamageTable(unit), renderPassengerFirepower(unit), renderAbilityCards(unit), renderResearchList(unit),
      renderReadingGuide()].join("");
  }

  const AREA_KEYWORDS = { circle: "Area", point: "Single target", squad: "Single squad" };

  function renderSpellHeader(spell) {
    const keywords = [AREA_KEYWORDS[spell.area], spell.affects].filter(Boolean)
      .map((keyword) => `<span class="keyword">${escapeHtml(keyword)}</span>`).join("");
    const flavour = descriptionLines(spell.desc).join(" ");
    const requirementsBeyondCaster = spell.requires.filter((requirement) => requirement.text !== spell.castFrom);
    return `<header class="unit-head">
      <p class="eyebrow"><span>${escapeHtml(currentRace.name)}</span><span>${renderTier(spell.tier)}</span>
        <span>Cast from ${escapeHtml(spell.castFrom)}</span></p>
      <h2>${escapeHtml(spell.name)}</h2>
      <div class="keyword-row"><span class="spell-badge">Spell</span>${keywords}</div>
      ${flavour ? `<p class="flavour">${escapeHtml(flavour)}</p>` : ""}
      ${renderChipRow("Targets", spell.targets.map((target) => renderChip(target)))}
      ${renderRequirements(requirementsBeyondCaster)}
    </header>`;
  }

  function renderSpellStatCard(spell) {
    const lasts = spell.creates ? spell.creates.lifetime : spell.duration;
    const largestRadius = Math.max(0, ...spell.parts.map((part) => part.radius || 0));
    const costHtml = Object.entries(spell.cost)
      .map(([resource, amount]) => `${formatNumber(amount)}<small>${resource}</small>`).join(" ") || "Free";
    return `<section class="stat-card" aria-label="Spell stats">
      <div class="vitals">
        ${renderVital("cost", "Cost", costHtml, [])}
        ${renderVital("cooldown", "Cooldown", formatDuration(spell.recharge), [])}
        ${renderVital("lasts", "Lasts", lasts > 1 ? formatDuration(lasts) : "Instant", [])}
      </div>
      <dl class="attributes">
        ${renderAttribute("Range", spell.range ? formatNumber(spell.range) : "—")}
        ${renderAttribute("Radius", largestRadius ? formatNumber(largestRadius) : "—")}
        ${spell.creates ? renderAttribute("Moves at", formatNumber(spell.creates.speed)) : ""}
      </dl>
    </section>`;
  }

  const isSameEffect = (first, second) => first.effect === second.effect && first.change === second.change
    && first.lasts === second.lasts;

  function renderSpellEffects(spell) {
    const effects = spell.parts.flatMap((part) => part.effects)
      .filter((effect, index, all) => all.findIndex((other) => isSameEffect(effect, other)) === index);
    if (!effects.length) return renderEmptySection("Effects");
    const headerRow = `<tr><th>Effect</th><th class="numeric">Change</th><th class="numeric">Lasts</th></tr>`;
    const bodyRows = effects.map((effect) => `<tr><td>${escapeHtml(effect.effect)}</td>
      <td class="numeric">${effect.change ? escapeHtml(effect.change) : "—"}</td>
      <td class="numeric">${formatSeconds(effect.lasts)}</td></tr>`).join("");
    return renderSection("Effects", "", renderTable(headerRow, bodyRows));
  }

  function spellDamageRows({ damage, every, lasts }) {
    const scaled = (factor) => damage.byArmour.map((value) => (value === null ? null : value * factor));
    const moraleNote = (amount) => (amount ? `${formatNumber(amount)} morale damage` : "");
    if (!every) return [{ name: "Each hit", dps: damage.byArmour, notes: [moraleNote(damage.morale)] }];
    return [
      { name: "Per second", dps: scaled(1 / every), notes: [`Hits every ${formatNumber(every, 2)} s`, moraleNote(damage.morale / every)] },
      { name: `Over ${formatSeconds(lasts)}`, dps: scaled(lasts / every), notes: [moraleNote((damage.morale * lasts) / every)] },
    ];
  }

  function renderSpellDamage(spell) {
    const rows = spell.parts.filter((part) => part.damage).flatMap(spellDamageRows).map((row) => ({
      ...row,
      labelHtml: `<strong>${escapeHtml(row.name)}</strong>${row.notes.filter(Boolean)
        .map((note) => `<span class="secondary-text">${escapeHtml(note)}</span>`).join("")}`,
    }));
    if (!rows.length) return "";
    return renderSection("Damage vs armour", "Each model caught", renderArmourHeatTable(rows, "Damage"));
  }

  const renderSpellPage = (spell) =>
    [renderSpellHeader(spell), renderSpellStatCard(spell), renderSpellEffects(spell), renderSpellDamage(spell)].join("");

  const ROMAN_NUMERALS = ["", "I", "II", "III", "IV"];
  const HIGHEST_TIER = 3;
  const renderTier = (tier) => `<span class="tier-pips" aria-hidden="true">${Array.from({ length: HIGHEST_TIER },
    (_, index) => `<i${index < tier ? ` class="reached"` : ""}></i>`).join("")}</span>Tier ${ROMAN_NUMERALS[tier]}`;

  const commanderLabel = (unit) => (isStandaloneCommander(unit) ? "Standalone commander"
    : trooperOf(unit).armour === "Commander" ? "Attachable commander" : "Attaches to squads");

  function renderHeader(unit) {
    const { typeKeywords, strongAgainst, flavour } = readUnitDescription(unit);
    const commanderBadge = unit.role ? `<span class="commander-badge">${commanderLabel(unit)}</span>` : "";
    const keywordBadges = unitKeywords(unit, typeKeywords)
      .map((keyword) => `<span class="keyword">${escapeHtml(keyword)}</span>`).join("");
    const joinableSquads = isAttachable(unit) ? unit.joins.map((squad) => renderChip(squad)) : [];
    return `<header class="unit-head">
      <p class="eyebrow"><span>${escapeHtml(currentRace.name)}</span><span>${renderTier(unit.tier)}</span>
        <span>${escapeHtml(unit.origin)}</span></p>
      <h2>${escapeHtml(unit.name)}</h2>
      <div class="keyword-row">${commanderBadge}${keywordBadges}</div>
      ${flavour ? `<p class="flavour">${escapeHtml(flavour)}</p>` : ""}
      ${renderChipRow("Strong vs", strongAgainst.map((target) => renderChip(target)))}
      ${renderChipRow("Joins", joinableSquads)}
      ${renderRequirements(unit.requires)}
    </header>`;
  }

  function capabilityTags(unit) {
    const { transportable, transportSlots, selfBuilding, cannibalises, infiltrationNeedsResearch,
      weaponUpgradeLimit, transformsInto, spawns } = unit.capabilities;
    return [
      transportable && "Transportable",
      transportSlots && `Holds ${transportSlots} squad${transportSlots > 1 ? "s" : ""}`,
      trooperOf(unit).detect && "Detector",
      selfBuilding && "Self-building",
      cannibalises && "Cannibalises",
      infiltrationNeedsResearch && "Infiltration needs research",
      weaponUpgradeLimit && `Max ${weaponUpgradeLimit} weapon upgrade${weaponUpgradeLimit > 1 ? "s" : ""}`,
      ...transformsInto.map((squad) => `Transforms into ${squad}`),
      ...spawns.map((squad) => `Spawns ${squad}`),
    ].filter(Boolean);
  }

  const renderVital = (className, label, valueHtml, notes) => `<div class="vital ${className}">
      <div class="vital-label">${label}</div><div class="vital-value">${valueHtml}</div>
      ${notes.filter(Boolean).map((note) => `<div class="vital-note">${note}</div>`).join("")}</div>`;
  const renderAttribute = (label, valueHtml, note) => `<div class="attribute"><dt>${label}</dt><dd>${valueHtml}</dd>${
    note ? `<dd class="attribute-note">${note}</dd>` : ""}</div>`;

  const maxModelCount = (model) => Number(String(model.count).split("–").pop()) || 1;
  const squadHealth = (unit) => trooperOf(unit).hp * unit.size.max;
  const comparisonClassOf = (unit) => {
    const armour = trooperOf(unit).armour;
    if (armour.startsWith("Vehicle") || armour.startsWith("Air")) return "vehicles";
    return armour.startsWith("Monster") ? "monsters" : "infantry";
  };

  function renderComparisonBar(unit, measure, statName) {
    const peers = currentRace.units.filter((peer) => comparisonClassOf(peer) === comparisonClassOf(unit));
    const topPeer = peers.reduce((best, peer) => (measure(peer) > measure(best) ? peer : best), unit);
    const fill = measure(topPeer) ? measure(unit) / measure(topPeer) : 0;
    const scope = `${currentRace.short || currentRace.name} ${comparisonClassOf(unit)}`;
    const title = topPeer === unit ? `Highest ${statName} among ${scope}`
      : `${topPeer.name} has the highest ${statName} among ${scope} (${formatNumber(measure(topPeer))})`;
    return `<div class="compare-bar" title="${escapeHtml(title)}"><span style="--fill:${fill.toFixed(3)}"></span></div>`;
  }

  const DAMAGE_PROFILE_TARGETS = [["Infantry", "Infantry"], ["Heavy infantry", "Heavy infantry"], ["Vehicle", "Vehicles"],
    ["Monster", "Monsters"], ["Building", "Buildings"]];
  const armourIndexesByTarget = DAMAGE_PROFILE_TARGETS.map(([armourGroup]) =>
    data.armour.flatMap((armour, index) => (armour.group === armourGroup ? [index] : [])));
  const sumOf = (values) => values.reduce((sum, value) => sum + value, 0);
  const modifiedValue = (base, modifiers) =>
    (base + sumOf(modifiers.filter((entry) => entry.usage === "addition").map((entry) => entry.value)))
    * modifiers.filter((entry) => entry.usage === "multiplication").reduce((product, entry) => product * entry.value, 1);
  const noResearch = () => [];

  function researchModifiersOf(unit) {
    const entriesByKey = new Map();
    for (const entry of unit.upgrades.flatMap((upgrade) => upgrade.modifiers)) {
      const key = `${entry.target}|${entry.modifier}`;
      entriesByKey.set(key, [...(entriesByKey.get(key) || []), entry]);
    }
    return (target, modifier) => entriesByKey.get(`${target}|${modifier}`) || [];
  }

  const damageRangeOf = (weapon) => String(weapon.damage).replaceAll(",", "").split("–").map(Number);

  function weaponScaleOf(weapon, modifiersOf) {
    const [minimum, maximum = minimum] = damageRangeOf(weapon);
    const damageScale = minimum + maximum
      ? (modifiedValue(minimum, modifiersOf(weapon.id, "min_damage_weapon_modifier"))
        + modifiedValue(maximum, modifiersOf(weapon.id, "max_damage_weapon_modifier"))) / (minimum + maximum)
      : 1;
    const accuracyModifiers = [...modifiersOf(weapon.id, "accuracy_weapon_modifier"),
      ...modifiersOf(weapon.id, "accuracy_ranged_weapon_modifier")];
    const accuracyScale = weapon.accuracy ? Math.min(1, modifiedValue(weapon.accuracy, accuracyModifiers)) / weapon.accuracy : 1;
    return damageScale * accuracyScale;
  }

  function modelCountsOf(unit, modifiersOf) {
    const extraLeaders = sumOf(modifiersOf(unit.id, "max_leaders_squad_modifier").map((entry) => entry.value));
    const firstLeader = unit.models.find((model) => model.role === "Leader");
    return new Map(unit.models.map((model) => [model.name, maxModelCount(model) + (model === firstLeader ? extraLeaders : 0)]));
  }

  function equippedSlotsOf(unit, withResearch) {
    const slotsByModel = new Map(unit.models.map((model) => [model.name, new Map()]));
    for (const weapon of unit.weapons) {
      const isEquipped = weapon.source === "Default" || (withResearch && weapon.unlockedBy);
      if (isEquipped) weapon.hardpoints.forEach((hardpoint) => slotsByModel.get(weapon.model).set(hardpoint, weapon));
    }
    return slotsByModel;
  }

  function combatProfileOf(unit, withResearch, buys) {
    const modifiersOf = withResearch ? researchModifiersOf(unit) : noResearch;
    const modelCounts = modelCountsOf(unit, modifiersOf);
    const slotsByModel = equippedSlotsOf(unit, withResearch);
    const copiesByWeapon = new Map();
    const addCopies = (weapon, copies) => copiesByWeapon.set(weapon, (copiesByWeapon.get(weapon) || 0) + copies);
    slotsByModel.forEach((slots, modelName) => slots.forEach((weapon) => addCopies(weapon, modelCounts.get(modelName))));
    for (const bought of buys) {
      for (const hardpoint of bought.hardpoints) {
        const replaced = slotsByModel.get(bought.model).get(hardpoint);
        if (replaced) addCopies(replaced, -1);
        addCopies(bought, 1);
      }
    }
    const dps = { ranged: data.armour.map(() => 0), melee: data.armour.map(() => 0) };
    const rangedWeapons = [];
    copiesByWeapon.forEach((copies, weapon) => {
      if (!copies || weapon.effectOnly) return;
      const mode = weapon.melee ? "melee" : "ranged";
      if (mode === "ranged") rangedWeapons.push(weapon);
      const scale = weaponScaleOf(weapon, modifiersOf);
      weapon.dps.forEach((value, armourIndex) => { dps[mode][armourIndex] += (value || 0) * copies * scale; });
    });
    const largestRangedValue = (key) => Math.max(0, ...rangedWeapons.map((weapon) => weapon[key] || 0));
    const trooper = trooperOf(unit);
    return {
      buys,
      dps,
      models: unit.models.map((model) => ({ model, count: modelCounts.get(model.name),
        hp: modifiedValue(model.hp, modifiersOf(model.id, "health_maximum_modifier")) })),
      reach: largestRangedValue("range"),
      setup: largestRangedValue("setup"),
      movingPenalty: largestRangedValue("movingAccuracyPenalty"),
      speed: modifiedValue(trooper.speed, modifiersOf(trooper.id, "speed_maximum_modifier")),
      jumpRange: jumpRangeOf(unit),
    };
  }

  const baseProfileByUnit = new Map();
  const researchedProfileByUnit = new Map();
  const remembered = (cache, key, compute) => {
    if (!cache.has(key)) cache.set(key, compute());
    return cache.get(key);
  };
  const baseProfileOf = (unit) => remembered(baseProfileByUnit, unit, () => combatProfileOf(unit, false, []));
  const researchedProfileOf = (unit) => remembered(researchedProfileByUnit, unit, () => combatProfileOf(unit, true, []));

  const averageAt = (values, indexes) => indexes.reduce((sum, index) => sum + values[index], 0) / indexes.length;
  function squadDamageProfile(unit) {
    const squadDps = baseProfileOf(unit).dps;
    return {
      ranged: armourIndexesByTarget.map((indexes) => averageAt(squadDps.ranged, indexes)),
      melee: armourIndexesByTarget.map((indexes) => averageAt(squadDps.melee, indexes)),
    };
  }

  function renderDamageProfile(unit) {
    const profile = squadDamageProfile(unit);
    if (![...profile.ranged, ...profile.melee].some((value) => value > 0)) return "";
    const raceProfiles = currentRace.units.map(squadDamageProfile);
    const highestByTarget = DAMAGE_PROFILE_TARGETS.map((_, index) =>
      Math.max(...raceProfiles.flatMap((peer) => [peer.ranged[index], peer.melee[index]])));
    const renderBar = (mode, index) => {
      const value = profile[mode][index];
      const fill = highestByTarget[index] ? value / highestByTarget[index] : 0;
      return `<div class="damage-bar ${mode}"><div class="damage-bar-track"><span style="--fill:${fill.toFixed(3)}"></span></div>
        <b>${value ? formatNumber(value, 0) : "—"}</b></div>`;
    };
    const targets = DAMAGE_PROFILE_TARGETS.map(([, label], index) => `<div>
      <div class="damage-target-label">${label}</div>${renderBar("ranged", index)}${renderBar("melee", index)}</div>`).join("");
    return `<div class="damage-profile">
      <div class="damage-profile-head"><span>Squad damage per second</span>
        <span class="damage-legend"><span class="ranged">Ranged</span><span class="melee">Melee</span></span></div>
      <div class="damage-targets">${targets}</div></div>`;
  }

  function renderStatCard(unit) {
    const trooper = trooperOf(unit);
    const { min, max } = unit.size;
    const isSingleModel = max === 1;
    const leaderSummary = unit.models.filter((model) => model.role === "Leader")
      .map((leader) => `+ ${escapeHtml(leader.name)} (up to ${leader.count.split("–")[1]})`).join(", ");
    return `<section class="stat-card" aria-label="Unit stats">
      <div class="vitals">
        ${renderVital("health", "Health", `${formatNumber(trooper.hp)}${isSingleModel ? "" : "<small>per model</small>"}${
          renderComparisonBar(unit, (peer) => trooperOf(peer).hp, "health")}`, [
          isSingleModel ? "" : `Squad ${formatNumber(trooper.hp * min)}–${formatNumber(trooper.hp * max)}${
            renderComparisonBar(unit, squadHealth, "squad health")}`,
          trooper.regen ? `Regenerates ${formatNumber(trooper.regen)}/s` : "No regeneration"])}
        ${unit.morale
          ? renderVital("morale", "Morale", formatNumber(unit.morale.max), [`Regenerates ${formatNumber(unit.morale.regen)}/s`])
          : renderVital("morale", "Morale", "—", ["No morale bar"])}
        ${renderVital("cost", "Cost", formatCostWithUnits(unit.cost), unit.costNote ? [escapeHtml(unit.costNote)]
          : [isSingleModel ? "" : `${min} models`, `Build ${formatSeconds(unit.cost.time)}`])}
      </div>
      <dl class="attributes">
        ${renderAttribute("Armour", escapeHtml(trooper.armour))}
        ${renderAttribute("Speed", formatNumber(trooper.speed) + renderComparisonBar(unit, (peer) => trooperOf(peer).speed, "speed"))}
        ${renderAttribute("Sight", formatNumber(trooper.sight) + renderComparisonBar(unit, (peer) => trooperOf(peer).sight, "sight"))}
        ${renderAttribute("Detection", trooper.detect ? formatNumber(trooper.detect) : "—")}
        ${renderAttribute("Squad size", isSingleModel ? "1" : `${min}–${max}`, leaderSummary || (isSingleModel ? "" : "No leader"))}
        ${renderAttribute("Reinforce", unit.reinforce ? formatCost(unit.reinforce) : "—",
          unit.reinforce ? `${formatSeconds(unit.reinforce.time)} per model` : isSingleModel ? "" : "Can't reinforce")}
        ${renderAttribute("Squad cap", formatNumber(unit.caps.squad))}
        ${renderAttribute("Support cap", formatNumber(unit.caps.support))}
      </dl>
      ${renderDamageProfile(unit)}
      ${capabilityTags(unit).length
        ? `<ul class="stat-card-tags">${capabilityTags(unit).map((tag) => `<li>${escapeHtml(tag)}</li>`).join("")}</ul>` : ""}
    </section>`;
  }

  function renderModelsTable(unit) {
    const headerRow = `<tr><th>Model</th><th class="numeric">Count</th><th class="numeric">Health</th><th>Armour</th>
      <th class="numeric">Regen / s</th><th class="numeric">Speed</th><th class="numeric">Sight</th>
      <th class="numeric">Detection</th><th class="numeric">Cost each</th><th class="numeric">Time each</th></tr>`;
    const bodyRows = unit.models.map((model) => `<tr>
      <td><strong>${escapeHtml(model.name)}</strong><span class="secondary-text">${model.role}</span></td>
      <td class="numeric">${escapeHtml(model.count)}</td><td class="numeric">${formatNumber(model.hp)}</td>
      <td>${escapeHtml(model.armour)}</td><td class="numeric">${formatNumber(model.regen)}</td>
      <td class="numeric">${formatNumber(model.speed)}</td><td class="numeric">${formatNumber(model.sight)}</td>
      <td class="numeric">${model.detect ? formatNumber(model.detect) : "—"}</td>
      <td class="numeric">${formatCost(model.cost)}</td><td class="numeric">${formatSeconds(model.cost.time)}</td></tr>`).join("");
    return renderSection("Models", "", renderTable(headerRow, bodyRows));
  }

  const renderWeaponName = (weapon) => `<strong>${escapeHtml(weapon.name)}</strong>${
    weapon.hardpoints.length > 1 ? ` <span class="count">×${weapon.hardpoints.length}</span>` : ""}`;
  const weaponRelation = (weapon) => (weapon.replaces ? `Replaces ${weapon.replaces}` : weapon.adds ? "Extra weapon" : "");

  function renderWeaponSource(weapon) {
    const isDefault = weapon.source === "Default";
    const badge = `<span class="badge${isDefault ? " neutral" : ""}">${escapeHtml(weapon.source)}</span>`;
    const details = [
      isDefault ? "" : weapon.note,
      weapon.requires.length ? `Needs ${weapon.requires.map((requirement) => requirement.text).join(", ")}` : "",
      weaponRelation(weapon),
    ];
    return badge + details.filter(Boolean).map((detail) => `<span class="secondary-text">${escapeHtml(detail)}</span>`).join("");
  }

  function renderWeaponsTable(unit) {
    if (!unit.weapons.length) return renderEmptySection("Weapons");
    const headerRow = `<tr><th>Weapon</th><th>Carried by</th><th>How you get it</th><th class="numeric">Range</th>
      <th class="numeric">Damage</th><th class="numeric">Reload</th><th class="numeric">Accuracy</th>
      <th class="numeric">Splash</th><th class="numeric">Morale damage</th></tr>`;
    const bodyRows = unit.weapons.map((weapon) => `<tr title="${escapeHtml(weapon.id)}">
      <td>${renderWeaponName(weapon)}${weapon.effects.map((effect) => `<span class="effect">${escapeHtml(effect)}</span>`).join("")}</td>
      <td>${escapeHtml(weapon.model)}</td>
      <td>${renderWeaponSource(weapon)}</td>
      <td class="numeric">${weapon.melee ? "Melee" : formatNumber(weapon.range)}</td>
      <td class="numeric">${escapeHtml(weapon.damage)}</td><td class="numeric">${formatSeconds(weapon.reload)}</td>
      <td class="numeric">${formatPercent(weapon.accuracy)}</td><td class="numeric">${weapon.aoe ? formatNumber(weapon.aoe) : "—"}</td>
      <td class="numeric">${formatNumber(weapon.morale)}</td></tr>`).join("");
    return renderSection("Weapons", "Per model, before research", renderTable(headerRow, bodyRows));
  }

  function renderArmourHeatTable(rows, firstColumnTitle) {
    const armourTypes = data.armour;
    const startsArmourGroup = (index) => index === 0 || armourTypes[index - 1].group !== armourTypes[index].group;
    const armourGroups = [];
    armourTypes.forEach((armour, index) => {
      if (startsArmourGroup(index)) armourGroups.push({ name: armour.group, span: 1, hasSubtypes: Boolean(armour.label) });
      else armourGroups[armourGroups.length - 1].span++;
    });
    const highestDps = Math.max(0, ...rows.flatMap((row) => row.dps.filter((value) => value !== null)));
    const heatLevel = (value) => (value && highestDps ? (value / highestDps).toFixed(3) : 0);
    const groupStartClass = (index) => (startsArmourGroup(index) ? " armour-group-start" : "");
    const headerRows = `<tr><th rowspan="2">${firstColumnTitle}</th>${armourGroups.map((group) => (group.hasSubtypes
      ? `<th class="armour-group-start" colspan="${group.span}">${escapeHtml(group.name)}</th>`
      : `<th class="armour-group-start numeric" rowspan="2">${escapeHtml(group.name)}</th>`)).join("")}</tr>
      <tr>${armourTypes.map((armour, index) => (armour.label
        ? `<th class="numeric${groupStartClass(index)}">${escapeHtml(armour.label)}</th>` : "")).join("")}</tr>`;
    const bodyRows = rows.map((row) => `<tr${row.isAttachment ? ` class="attachment-row"` : ""}><td>${row.labelHtml}</td>
      ${row.dps.map((value, index) => `<td class="numeric${groupStartClass(index)}${value === 0 ? " zero" : ""}"
        style="--heat-level:${heatLevel(value)}" title="${escapeHtml(`${row.name} vs ${armourTypes[index].full}`)}">${
        value === null ? "—" : formatNumber(value)}</td>`).join("")}
      </tr>`).join("");
    return renderTable(headerRows, bodyRows, "heat-table");
  }

  function renderDamageTable(unit) {
    const damagingWeapons = unit.weapons.filter((weapon) => !weapon.effectOnly && weapon.source !== "Passenger");
    if (!damagingWeapons.length) return "";
    const rows = damagingWeapons.map((weapon) => ({
      name: weapon.name, dps: weapon.dps,
      labelHtml: `${renderWeaponName(weapon)}<span class="secondary-text">${escapeHtml(weapon.model)}</span>`,
    }));
    return renderSection("Damage per second vs armour", "Per model, before research", renderArmourHeatTable(rows, "Weapon"));
  }

  function renderPassengerFirepower(unit) {
    if (!unit.loads.length) return "";
    const rows = unit.loads.map((load) => ({
      name: load.name, dps: load.dps, isAttachment: load.child,
      labelHtml: `<strong>${escapeHtml(load.name)}</strong><span class="secondary-text">${escapeHtml(load.detail)}</span>`,
    }));
    return renderSection("Passenger firepower", `${unit.seats} firing seats`, renderArmourHeatTable(rows, "Passengers"));
  }

  function renderAbilityCards(unit) {
    if (!unit.abilities.length) return renderEmptySection("Abilities");
    const cards = unit.abilities.map((ability) => {
      const facts = [
        ["Recharge", ability.recharge ? formatSeconds(ability.recharge) : ""],
        ["Duration", ability.duration ? formatSeconds(ability.duration) : ""],
        ["Range", ability.range ? formatNumber(ability.range) : ""],
        ["Radius", ability.radius ? formatNumber(ability.radius) : ""],
        ["Cost", ability.cost], ["Damage", ability.damage], ...(ability.facts || []),
      ].filter(([, value]) => value);
      return `<article class="card">
        <div class="card-head"><h4>${escapeHtml(ability.name)}</h4><span class="badge neutral">${escapeHtml(ability.activation)}</span></div>
        <span class="secondary-text">Used by ${escapeHtml(ability.users.join(", "))}</span>
        ${renderDescription(ability.desc)}
        ${facts.length ? `<dl class="facts">${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>` : ""}
        ${renderBulletList(ability.effects)}
        ${renderRequirements(ability.requires)}
      </article>`;
    }).join("");
    return renderSection("Abilities", "", `<div class="cards">${cards}</div>`);
  }

  function renderResearchList(unit) {
    const title = "Research that affects this unit";
    if (!unit.upgrades.length) return renderEmptySection(title);
    const rows = unit.upgrades.map((upgrade) => `<div class="research-row">
      <div><h4>${escapeHtml(upgrade.name)}</h4><span class="secondary-text">${escapeHtml(upgrade.where)}</span>
        <span class="secondary-text">${escapeHtml(upgrade.cost)}${upgrade.time ? ` · ${formatSeconds(upgrade.time)}` : ""}</span></div>
      ${renderBulletList(upgrade.effects)}</div>`).join("");
    return renderSection(title, "", `<div class="research-list">${rows}</div>`);
  }

  function renderReadingGuide() {
    return `<details><summary>How to read these numbers</summary><ul>
      <li>A unit's tier is the highest tier unlock anywhere in its requirements, including the building that makes it.
        Most races unlock tiers with HQ add-ons, Necrons with Monolith stages, Eldar with Mobilize for War and Annihilate
        the Enemy, Tau with Path to Enlightenment and then a Kauyon or Mont'ka Command Post, and Orks with 50 population
        and then the Orky Fort.</li>
      <li>DPS is accuracy ÷ reload × the larger of the damage floor and average damage × armour pierce %. It leaves out
        splash, setup time, accuracy lost while moving, cover and morale.</li>
      <li>Speed, sight, detection and range are in game distance units.</li>
      <li>Built ${escapeHtml(data.generated)} from ${escapeHtml(data.source)}.</li>
    </ul></details>`;
  }

  const FAVOURED_EXCHANGE = 1.5;
  const armourIndexByName = new Map(data.armour.map((armour, index) =>
    [armour.label ? `${armour.group} (${armour.label.toLowerCase()})` : armour.group, index]));
  const resourcesOf = (cost) => cost.req + cost.power;

  function fullSquadCost(unit) {
    const [, ...leaders] = unit.models;
    const reinforcements = unit.reinforce ? (unit.size.max - unit.size.min) * resourcesOf(unit.reinforce) : 0;
    return resourcesOf(unit.cost) + reinforcements
      + leaders.reduce((total, leader) => total + maxModelCount(leader) * resourcesOf(leader.cost), 0);
  }

  function timeToKill(attacker, defender) {
    const secondsUsing = (mode) => defender.models.reduce((total, { model, count, hp }) => {
      const dps = attacker.dps[mode][armourIndexByName.get(model.armour)] || 0;
      return total + (dps ? (hp * count) / dps : Infinity);
    }, 0);
    const ranged = secondsUsing("ranged");
    const melee = secondsUsing("melee");
    return ranged <= melee ? { seconds: ranged, mode: "ranged" } : { seconds: melee, mode: "melee" };
  }

  function exchangeRatio(ourSeconds, theirSeconds) {
    if (ourSeconds === Infinity && theirSeconds === Infinity) return null;
    return theirSeconds / ourSeconds;
  }

  const verdictFor = (ratio) => (ratio >= FAVOURED_EXCHANGE ? "Favoured" : ratio <= 1 / FAVOURED_EXCHANGE ? "Countered" : "Even");

  const fastestPathByRace = new Map();

  function fastestTechPath(race, nodeId) {
    if (!fastestPathByRace.has(race)) fastestPathByRace.set(race, { finishById: new Map(), chosenNeedsById: new Map() });
    const { finishById, chosenNeedsById } = fastestPathByRace.get(race);
    const isAvailable = (id) => race.startingBuildings.includes(id) || !race.tech[id];
    const finishOf = (id, visiting) => {
      if (isAvailable(id)) return 0;
      if (finishById.has(id)) return finishById.get(id);
      if (visiting.has(id)) return Infinity;
      visiting.add(id);
      const node = race.tech[id];
      const chosenNeeds = node.needs.map((alternatives) =>
        alternatives.reduce((fastest, option) => (finishOf(option, visiting) < finishOf(fastest, visiting) ? option : fastest)));
      const start = Math.max(0, ...chosenNeeds.map((need) => finishOf(need, visiting)));
      visiting.delete(id);
      finishById.set(id, start + node.time);
      chosenNeedsById.set(id, chosenNeeds);
      return start + node.time;
    };
    const finish = finishOf(nodeId, new Set());
    const steps = [];
    const collected = new Set();
    const collect = (id) => {
      if (collected.has(id) || isAvailable(id)) return;
      collected.add(id);
      chosenNeedsById.get(id).forEach(collect);
      const node = race.tech[id];
      steps.push({ id, name: node.name, start: finishById.get(id) - node.time, finish: finishById.get(id),
        cost: node.cost, untimed: node.untimed });
    };
    collect(nodeId);
    steps.sort((first, second) => first.start - second.start || first.finish - second.finish);
    return { finish, steps };
  }

  function incomeOf(race) {
    const { base, generator, pointRequisition, listeningPostMultiplier } = race.economy;
    const { points, listeningPosts } = economyAssumptions;
    const pointsWithPosts = Math.min(listeningPosts, points);
    const generators = Math.min(economyAssumptions.generators, economyLimitFor(race, "generators"));
    return {
      req: base.req + pointRequisition * (points - pointsWithPosts + pointsWithPosts * listeningPostMultiplier),
      power: base.power + (generator ? generator.power * generators : 0),
    };
  }

  function arrivalOf(race, unit) {
    const path = fastestTechPath(race, unit.id);
    const income = incomeOf(race);
    const totalCost = path.steps.reduce((sum, step) => ({ req: sum.req + step.cost.req, power: sum.power + step.cost.power }),
      { req: 0, power: 0 });
    const secondsToAfford = (needed, owned, rate) => {
      if (needed <= owned) return 0;
      return rate > 0 ? (needed - owned) / rate : Infinity;
    };
    const affordableAt = Math.max(secondsToAfford(totalCost.req, race.economy.start.req, income.req),
      secondsToAfford(totalCost.power, race.economy.start.power, income.power));
    return { path, income, totalCost, fastest: path.finish, withEconomy: Math.max(path.finish, affordableAt) };
  }

  const isOnBoard = (unit, enemy, opponent) => {
    if (enemyScope === "all") return true;
    if (enemyScope === "tier") return enemy.tier <= unit.tier;
    return arrivalOf(opponent, enemy).withEconomy <= arrivalOf(currentRace, unit).withEconomy;
  };

  const jumpRangeOf = (unit) => (unit.abilities.find((ability) => ability.id.endsWith("#jump")) || {}).range || 0;

  function engagementOf(ours, theirs, ourKill, theirKill) {
    const reachIn = (profile, kill) => (kill.mode === "melee" ? 0 : profile.reach);
    const setupIn = (profile, kill) => (kill.mode === "melee" ? 0 : profile.setup);
    const ourReach = reachIn(ours, ourKill);
    const theirReach = reachIn(theirs, theirKill);
    let closer = null;
    if (ourReach < theirReach) closer = "you";
    else if (theirReach < ourReach) closer = "them";
    const closing = closer === "you" ? ours : theirs;
    const gap = Math.abs(ourReach - theirReach);
    const jumped = closer ? Math.min(gap, closing.jumpRange) : 0;
    let timeUnderFire = 0;
    if (closer) timeUnderFire = closing.speed ? (gap - jumped) / closing.speed : Infinity;
    const shooterKillTime = closer === "you" ? theirKill.seconds : ourKill.seconds;
    const lostOnTheWay = closer && shooterKillTime !== Infinity ? Math.min(1, timeUnderFire / shooterKillTime) : 0;
    const ourClock = ourKill.seconds + setupIn(ours, ourKill) + (closer === "you" ? timeUnderFire : 0);
    const theirClock = theirKill.seconds + setupIn(theirs, theirKill) + (closer === "them" ? timeUnderFire : 0);
    return { closer, ourReach, theirReach, jumped, timeUnderFire, lostOnTheWay, exchange: exchangeRatio(ourClock, theirClock),
      closerMode: closer === "you" ? ourKill.mode : theirKill.mode, closerMovingPenalty: closing.movingPenalty };
  }

  function duelOf(ours, theirs) {
    const ourKill = timeToKill(ours, theirs);
    const theirKill = timeToKill(theirs, ours);
    return { ours: ourKill, theirs: theirKill, exchange: exchangeRatio(ourKill.seconds, theirKill.seconds),
      engagement: engagementOf(ours, theirs, ourKill, theirKill) };
  }

  const unbuiltProfileOf = (unit, withResearch) => (withResearch ? researchedProfileOf(unit) : baseProfileOf(unit));

  function buyingRulesOf(unit, withResearch) {
    const countByModel = new Map(unbuiltProfileOf(unit, withResearch).models.map(({ model, count }) => [model.name, count]));
    const leaderNames = new Set(unit.models.filter((model) => model.role === "Leader").map((model) => model.name));
    const isLeaderWeapon = (weapon) => leaderNames.has(weapon.model);
    const squadLimit = unit.capabilities.weaponUpgradeLimit + (withResearch
      ? sumOf(researchModifiersOf(unit)(unit.id, "max_upgrades_squad_modifier").map((entry) => entry.value)) : 0);
    const needsResearch = (weapon) => weapon.requires.some((requirement) => requirement.kind === "Research");
    const slotsByModel = equippedSlotsOf(unit, withResearch);
    const isAlreadyEquipped = (weapon) => weapon.hardpoints.every((hardpoint) =>
      slotsByModel.get(weapon.model).get(hardpoint) === weapon);
    const offers = unit.weapons.filter((weapon) => weapon.source === "Upgrade" && countByModel.has(weapon.model)
      && (withResearch || !needsResearch(weapon)) && !isAlreadyEquipped(weapon));
    const squadBuysIn = (buys) => buys.filter((bought) => !isLeaderWeapon(bought)).length;
    const canBuy = (buys, offer) => {
      const boughtOnSameHardpoint = (hardpoint) => buys.filter((bought) => bought.model === offer.model
        && bought.hardpoints.includes(hardpoint)).length;
      if (offer.hardpoints.some((hardpoint) => boughtOnSameHardpoint(hardpoint) >= countByModel.get(offer.model))) return false;
      if (offer.maxPerSquad && buys.filter((bought) => bought === offer).length >= offer.maxPerSquad) return false;
      return isLeaderWeapon(offer) || !squadLimit || squadBuysIn(buys) < squadLimit;
    };
    const keepAllowed = (buys) => buys.reduce((kept, bought) =>
      (offers.includes(bought) && canBuy(kept, bought) ? [...kept, bought] : kept), []);
    return { offers, squadLimit, isLeaderWeapon, squadBuysIn, canBuy, keepAllowed };
  }

  function bestBuysAgainst(unit, defender, withResearch) {
    const rules = buyingRulesOf(unit, withResearch);
    const unbuilt = unbuiltProfileOf(unit, withResearch);
    let best = { profile: unbuilt, seconds: timeToKill(unbuilt, defender).seconds };
    for (;;) {
      let improvement = null;
      for (const offer of rules.offers.filter((candidate) => rules.canBuy(best.profile.buys, candidate))) {
        const profile = combatProfileOf(unit, withResearch, [...best.profile.buys, offer]);
        const seconds = timeToKill(profile, defender).seconds;
        if (seconds < (improvement || best).seconds) improvement = { profile, seconds };
      }
      if (!improvement) return best.profile;
      best = improvement;
    }
  }

  const upgradedProfileByPair = new Map();
  const upgradedProfileOf = (unit, enemy) => remembered(upgradedProfileByPair, `${unit.id}>${enemy.id}`,
    () => bestBuysAgainst(unit, researchedProfileOf(enemy), true));

  function armsRaceOf(unit, enemy) {
    const yoursUpgraded = upgradedProfileOf(unit, enemy);
    const theirsUpgraded = upgradedProfileOf(enemy, unit);
    return {
      youUpgrade: duelOf(yoursUpgraded, baseProfileOf(enemy)),
      theyUpgrade: duelOf(baseProfileOf(unit), theirsUpgraded),
      both: duelOf(yoursUpgraded, theirsUpgraded),
      yourBuys: yoursUpgraded.buys,
      theirBuys: theirsUpgraded.buys,
    };
  }

  const fightSetupByPair = new Map();
  const fightSetupOf = (unit, enemy) => remembered(fightSetupByPair, `${unit.id}>${enemy.id}`, () => ({
    isOpen: false,
    you: { withResearch: true, buys: upgradedProfileOf(unit, enemy).buys },
    them: { withResearch: true, buys: upgradedProfileOf(enemy, unit).buys },
  }));
  const fightOf = (unit, enemy, setup) => duelOf(combatProfileOf(unit, setup.you.withResearch, setup.you.buys),
    combatProfileOf(enemy, setup.them.withResearch, setup.them.buys));

  function matchupsAgainst(unit, opponent) {
    const ourCost = fullSquadCost(unit);
    return opponent.units
      .filter((enemy) => !enemy.capabilities.builder && isOnBoard(unit, enemy, opponent))
      .map((enemy) => {
        const standing = duelOf(baseProfileOf(unit), baseProfileOf(enemy));
        const enemyCost = fullSquadCost(enemy);
        const valueTrade = standing.exchange !== null && ourCost && enemyCost ? standing.exchange * (enemyCost / ourCost) : null;
        return { enemy, ...standing, valueTrade, arrives: arrivalOf(opponent, enemy).withEconomy,
          armsRace: armsRaceOf(unit, enemy) };
      })
      .sort((first, second) => (second.exchange ?? -1) - (first.exchange ?? -1));
  }

  const formatDuration = (seconds) => {
    if (seconds === Infinity) return "—";
    if (seconds < 60) return `${formatNumber(seconds)} s`;
    const leftoverSeconds = Math.round(seconds % 60);
    return `${Math.floor(seconds / 60)}m${leftoverSeconds ? ` ${leftoverSeconds}s` : ""}`;
  };
  const formatRatio = (ratio) => {
    if (ratio === null) return "—";
    return ratio === Infinity ? "∞" : `${ratio < 10 ? ratio.toFixed(1) : formatNumber(ratio, 0)}×`;
  };
  const renderVerdict = (ratio) => (ratio === null ? ""
    : `<span class="verdict ${verdictFor(ratio).toLowerCase()}">${verdictFor(ratio)}</span>`);
  const renderEnemyLink = (enemy, opponent) =>
    `<a class="enemy-link" data-race="${escapeHtml(opponent.id)}" href="#${escapeHtml(enemy.id)}">${escapeHtml(enemy.name)}</a>`;
  const renderKillTime = (timing) => `${formatDuration(timing.seconds)}${
    timing.seconds === Infinity ? "" : `<span class="secondary-text">${timing.mode}</span>`}`;

  function renderMatchupHeader(unit, opponent) {
    const opponentButtons = data.races.map((race) => `<button type="button" class="opponent-btn" data-race="${escapeHtml(race.id)}"
      data-opponent="${escapeHtml(race.id)}" aria-pressed="${race === opponent}" title="${escapeHtml(race.name)}">${
      escapeHtml(race.short || race.name)}</button>`).join("");
    const scopeButton = (scope, label) => `<button type="button" class="scope-btn" data-enemy-scope="${scope}"
      aria-pressed="${scope === enemyScope}">${label}</button>`;
    return `<header class="unit-head">
      <p class="eyebrow"><span>Matchup analysis</span><span>${renderTier(unit.tier)}</span><span>${escapeHtml(unit.origin)}</span></p>
      <h2>${escapeHtml(unit.name)} <span class="versus">vs</span>
        <span class="opponent-name" data-race="${escapeHtml(opponent.id)}">${escapeHtml(opponent.name)}</span></h2>
      <div class="picker-row"><span class="chip-row-label">Opponent</span><div class="picker">${opponentButtons}</div></div>
      <div class="picker-row"><span class="chip-row-label">Enemies</span><div class="picker">${
        scopeButton("arrival", "When you arrive")}${scopeButton("tier", `Up to Tier ${ROMAN_NUMERALS[unit.tier]}`)}${
        scopeButton("all", "All tiers")}</div></div>
    </header>`;
  }

  function renderMatchupCards(matchups, opponent) {
    if (!matchups.length) return `<p class="empty-state">None</p>`;
    return `<div class="cards">${matchups.map((matchup) => `<article class="card">
      <div class="card-head"><h4>${renderEnemyLink(matchup.enemy, opponent)}</h4>${renderVerdict(matchup.engagement.exchange)}</div>
      <span class="secondary-text">Tier ${ROMAN_NUMERALS[matchup.enemy.tier]}</span>
      <dl class="facts">
        <div><dt>You kill them</dt><dd>${formatDuration(matchup.ours.seconds)}</dd></div>
        <div><dt>They kill you</dt><dd>${formatDuration(matchup.theirs.seconds)}</dd></div>
        <div><dt>With distance</dt><dd>${formatRatio(matchup.engagement.exchange)}</dd></div>
        <div><dt>Value trade</dt><dd>${formatRatio(matchup.valueTrade)}</dd></div>
      </dl></article>`).join("")}</div>`;
  }

  function renderMatchupTable(matchups, opponent) {
    if (!matchups.length) return `<p class="empty-state">None</p>`;
    const headerRow = `<tr><th>Enemy unit</th><th class="numeric">Tier</th><th class="numeric">Arrives</th>
      <th class="numeric">You kill them</th><th class="numeric">They kill you</th><th>Exchange</th><th class="numeric">Value trade</th></tr>`;
    const bodyRows = matchups.map((matchup) => `<tr>
      <td>${renderEnemyLink(matchup.enemy, opponent)}<span class="secondary-text">${escapeHtml(trooperOf(matchup.enemy).armour)}</span></td>
      <td class="numeric">${ROMAN_NUMERALS[matchup.enemy.tier]}</td><td class="numeric">${formatClock(matchup.arrives)}</td>
      <td class="numeric">${renderKillTime(matchup.ours)}</td><td class="numeric">${renderKillTime(matchup.theirs)}</td>
      <td>${renderVerdict(matchup.exchange)}<span class="ratio">${formatRatio(matchup.exchange)}</span></td>
      <td class="numeric">${formatRatio(matchup.valueTrade)}</td></tr>`).join("");
    return renderTable(headerRow, bodyRows, "matchup-table");
  }

  const formatReach = (reach) => (reach ? formatNumber(reach) : "Melee");

  function closingNote(engagement) {
    const notes = [];
    if (engagement.jumped) notes.push(`Jumps ${formatNumber(engagement.jumped)}`);
    if (engagement.closerMode === "ranged") {
      const penalty = engagement.closerMovingPenalty;
      notes.push(penalty >= 1 ? "Can't shoot while moving" : `Shoots at ${formatPercent(1 - penalty)} accuracy moving`);
    }
    return notes.map((note) => `<span class="secondary-text">${note}</span>`).join("");
  }

  function renderEngagementTable(matchups, opponent) {
    if (!matchups.length) return `<p class="empty-state">None</p>`;
    const headerRow = `<tr><th>Enemy unit</th><th class="numeric">Your reach</th><th class="numeric">Their reach</th>
      <th>Who closes</th><th class="numeric">Under fire</th><th class="numeric">Lost on the way</th><th>With distance</th></tr>`;
    const bodyRows = matchups.map(({ enemy, engagement }) => `<tr>
        <td>${renderEnemyLink(enemy, opponent)}</td>
        <td class="numeric">${formatReach(engagement.ourReach)}</td><td class="numeric">${formatReach(engagement.theirReach)}</td>
        <td>${whoClosesIn(engagement)}${engagement.closer ? closingNote(engagement) : ""}</td>
        <td class="numeric">${engagement.closer ? formatDuration(engagement.timeUnderFire) : "—"}</td>
        <td class="numeric">${engagement.closer ? formatPercent(engagement.lostOnTheWay) : "—"}</td>
        <td>${renderVerdict(engagement.exchange)}<span class="ratio">${formatRatio(engagement.exchange)}</span></td></tr>`).join("");
    return renderTable(headerRow, bodyRows, "engagement-table");
  }

  function whoClosesIn(engagement) {
    if (!engagement.closer) return "Neither";
    return engagement.closer === "you" ? "You" : "They";
  }

  const combatResearchOf = (unit) => unit.upgrades.filter((upgrade) => upgrade.modifiers.length
    || unit.weapons.some((weapon) => weapon.unlockedBy === upgrade.id));

  function renderBuys(buys, unit) {
    if (!buys.length) return "None";
    const counts = new Map();
    buys.forEach((weapon) => counts.set(weapon, (counts.get(weapon) || 0) + 1));
    const modelOrder = (weapon) => unit.models.findIndex((model) => model.name === weapon.model);
    const inSquadOrder = [...counts].sort(([first], [second]) => modelOrder(first) - modelOrder(second));
    return inSquadOrder.map(([weapon, count]) => `<span class="buy">${count}× ${escapeHtml(weapon.name)}${
      renderModelTag(weapon, unit)}</span>`).join("");
  }

  const renderModelTag = (weapon, squad) => (weapon.model === trooperOf(squad).name ? ""
    : ` <span class="buy-model">${escapeHtml(weapon.model)}</span>`);
  const renderExchange = (engagement) =>
    `${renderVerdict(engagement.exchange)}<span class="ratio">${formatRatio(engagement.exchange)}</span>`;
  const renderExchangeCell = (duel) => `<td>${renderExchange(duel.engagement)}</td>`;

  function renderFightSide(side, squad, sideSetup, enemyId) {
    const rules = buyingRulesOf(squad, sideSetup.withResearch);
    const fightButton = (action, label, attributes = "") => `<button type="button" id="fight-${escapeHtml(enemyId)}-${side}-${action}"
      data-fight-enemy="${escapeHtml(enemyId)}" data-fight-side="${side}" data-fight-action="${action}" ${attributes}>${label}</button>`;
    const offerSteppers = rules.offers.map((offer, index) => {
      const count = sideSetup.buys.filter((bought) => bought === offer).length;
      const name = escapeHtml(offer.name);
      return `<div class="stepper fight-offer"><span class="fight-offer-name">${name}${renderModelTag(offer, squad)}</span>
        ${fightButton(`fewer-${index}`, "−", `aria-label="Fewer ${name}"${count ? "" : " disabled"}`)}
        <output>${count}</output>
        ${fightButton(`more-${index}`, "+", `aria-label="More ${name}"${rules.canBuy(sideSetup.buys, offer) ? "" : " disabled"}`)}</div>`;
    }).join("");
    const hasSquadOffers = rules.offers.some((offer) => !rules.isLeaderWeapon(offer));
    let squadBuysText = "";
    if (hasSquadOffers) squadBuysText = rules.squadLimit ? `${rules.squadBuysIn(sideSetup.buys)} of ${rules.squadLimit}` : "No limit";
    return `<div class="fight-side">
      <div class="fight-side-head"><span class="chip-row-label">${side === "you" ? "You" : "Them"}</span>
        <strong>${escapeHtml(squad.name)}</strong>
        <div class="fight-presets">
          ${fightButton("research", "Research done", `class="scope-btn" aria-pressed="${sideSetup.withResearch}"`)}
          ${rules.offers.length ? `${fightButton("best", "Best", `class="scope-btn"`)}${fightButton("none", "None", `class="scope-btn"`)}` : ""}
        </div></div>
      ${squadBuysText ? `<dl class="facts"><div><dt>Squad weapon buys</dt><dd>${squadBuysText}</dd></div></dl>` : ""}
      ${offerSteppers ? `<div class="fight-offers">${offerSteppers}</div>` : `<p class="empty-state">No weapon buys</p>`}
    </div>`;
  }

  function renderFightPanel(unit, enemy) {
    const setup = fightSetupOf(unit, enemy);
    const fight = fightOf(unit, enemy, setup);
    return `<tr class="fight-row"><td colspan="7"><div class="fight">
      ${renderFightSide("you", unit, setup.you, enemy.id)}${renderFightSide("them", enemy, setup.them, enemy.id)}
      <dl class="fight-result">
        <div><dt>Exchange with distance</dt><dd>${renderExchange(fight.engagement)}</dd></div>
        <div><dt>You kill them</dt><dd>${renderKillTime(fight.ours)}</dd></div>
        <div><dt>They kill you</dt><dd>${renderKillTime(fight.theirs)}</dd></div>
        <div><dt>Who closes</dt><dd>${whoClosesIn(fight.engagement)}</dd></div>
      </dl></div></td></tr>`;
  }

  function renderArmsRaceTable(unit, matchups, opponent) {
    if (!matchups.length) return `<p class="empty-state">None</p>`;
    const headerRows = `<tr><th rowspan="2">Enemy unit</th><th colspan="4">Exchange with distance</th><th colspan="2">Weapon buys</th></tr>
      <tr><th>Neither upgrades</th><th>You upgrade</th><th>They upgrade</th><th>Both upgrade</th><th>Yours</th><th>Theirs</th></tr>`;
    const bodyRows = matchups.map((matchup) => {
      const isOpen = fightSetupOf(unit, matchup.enemy).isOpen;
      return `<tr class="fight-summary${isOpen ? " is-open" : ""}" data-fight="${escapeHtml(matchup.enemy.id)}">
      <td><button type="button" class="fight-toggle" id="fight-toggle-${escapeHtml(matchup.enemy.id)}" aria-expanded="${isOpen}"
        aria-label="Set up the fight against ${escapeHtml(matchup.enemy.name)}"></button>${renderEnemyLink(matchup.enemy, opponent)}</td>
      ${renderExchangeCell(matchup)}${renderExchangeCell(matchup.armsRace.youUpgrade)}
      ${renderExchangeCell(matchup.armsRace.theyUpgrade)}${renderExchangeCell(matchup.armsRace.both)}
      <td class="buys">${renderBuys(matchup.armsRace.yourBuys, unit)}</td>
      <td class="buys">${renderBuys(matchup.armsRace.theirBuys, matchup.enemy)}</td></tr>${
        isOpen ? renderFightPanel(unit, matchup.enemy) : ""}`;
    }).join("");
    return renderTable(headerRows, bodyRows, "arms-race-table");
  }

  function renderArmsRace(unit, matchups, opponent) {
    const researchChips = combatResearchOf(unit).map((upgrade) => renderChip(upgrade.name));
    return renderSection("Upgrade arms race", "Every research done, then the best weapon buys for each fight",
      `${renderChipRow("Your research", researchChips.length ? researchChips : [renderChip("None")])}
      ${renderArmsRaceTable(unit, matchups, opponent)}`);
  }

  const formatClock = (seconds) => (seconds === Infinity ? "—"
    : `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`);

  function renderTimeline(path) {
    const span = path.finish || 1;
    const rows = path.steps.map((step, index) => `<div class="timeline-row${index === path.steps.length - 1 ? " arrival" : ""}">
      <span class="timeline-label">${escapeHtml(step.name)}</span>
      <span class="timeline-track"><span class="timeline-bar" style="--from:${(step.start / span).toFixed(4)};--to:${(step.finish / span).toFixed(4)}"></span></span>
      <span class="timeline-time">${formatClock(step.finish)}</span></div>`).join("");
    return `<div class="timeline">${rows}</div>`;
  }

  function renderEconomyControls(race) {
    const income = incomeOf(race);
    const generatorName = race.economy.generator ? `${race.economy.generator.name}s` : "Generators";
    const stepper = (key, label) => `<div class="stepper"><span class="stepper-label">${label}</span>
      <button type="button" id="economy-${key}-fewer" data-economy="${key}" data-step="-1" aria-label="Fewer ${label.toLowerCase()}">−</button>
      <output>${Math.min(economyAssumptions[key], economyLimitFor(race, key))}</output>
      <button type="button" id="economy-${key}-more" data-economy="${key}" data-step="1" aria-label="More ${label.toLowerCase()}">+</button></div>`;
    return `<div class="economy">
      ${stepper("points", "Strategic points")}${stepper("listeningPosts", "Listening posts")}${stepper("generators", generatorName)}
      <div class="economy-income"><span>${formatNumber(income.req)} req/s</span><span>${formatNumber(income.power)} power/s</span></div></div>`;
  }

  function renderTiming(unit) {
    const arrival = arrivalOf(currentRace, unit);
    const untimed = [...new Set(arrival.path.steps.flatMap((step) => step.untimed))];
    return renderSection("Timing", "Fastest tech path from a fresh start", `<div class="timing">
      <dl class="timing-summary">
        <div><dt>Fastest tech path</dt><dd>${formatClock(arrival.fastest)}</dd></div>
        <div><dt>With your economy</dt><dd>${formatClock(arrival.withEconomy)}</dd></div>
        <div><dt>Path cost</dt><dd>${formatCostWithUnits(arrival.totalCost)}</dd></div>
      </dl>
      ${renderEconomyControls(currentRace)}
      ${renderChipRow("Also needs", untimed.map((need) => renderChip(need)))}
      ${renderTimeline(arrival.path)}</div>`);
  }

  function renderMatchupGuide() {
    return `<details><summary>How the matchup numbers work</summary><ul>
      <li>Time to kill is how long a full squad takes to destroy the full enemy squad with whichever of its ranged or melee
        weapons is faster. Default weapons, before research. Movement, cover, morale and splash are not included. Enemy
        builders are left out.</li>
      <li>Exchange is their time to kill you divided by your time to kill them. ${formatRatio(FAVOURED_EXCHANGE)} or more is
        Favoured; ${formatRatio(1 / FAVOURED_EXCHANGE)} or less is Countered.</li>
      <li>Value trade is the exchange adjusted for what each full squad costs, counting requisition and power equally.</li>
      <li>With distance adds the approach: each side fights in its faster mode, a melee side's reach is zero and a ranged
        side's reach is its longest default ranged weapon. The side with the shorter reach walks the gap at its own speed while
        the other fires; a jump covers its jump range at once. Heavy weapons add their setup time before the first shot. The
        Ideal targets and Hard counters cards use this distance-aware exchange. Speed is read as distance per second, which
        has not been checked in game yet, so closing times may be too short.</li>
      <li>Upgrading means every research that touches the squad is done: health, damage, accuracy, speed, extra leaders, a
        larger weapon limit and the weapons research hands out. The squad then buys weapons one at a time, each time taking the
        one that cuts its time to kill that enemy the most, until it reaches its weapon limit or nothing helps. Leaders buy
        their own weapons outside the limit, and a squad the game sets no limit for can upgrade every model once. Damage bonuses
        apply in full, ignoring minimum damage. Research and weapon costs are not counted.</li>
      <li>Fastest tech path is the quickest the unit can appear: every building, add-on and research it needs, built as early
        as their own prerequisites allow, then the squad itself. It assumes enough builders and resources for everything at once.</li>
      <li>With your economy also waits until the path is affordable: starting resources plus HQ income, 0.6 requisition per
        second for each strategic point (doubled by a listening post) and each generator's power, all running from the first
        second, with every resource spent on this path. Arrives in the table uses the same model for the enemy.</li>
    </ul></details>`;
  }

  function renderMatchupPage(unit, opponent) {
    const matchups = matchupsAgainst(unit, opponent);
    const rated = matchups.filter((matchup) => matchup.engagement.exchange !== null && matchup.theirs.seconds !== Infinity)
      .sort((first, second) => second.engagement.exchange - first.engagement.exchange);
    const idealTargets = rated.filter((matchup) => verdictFor(matchup.engagement.exchange) === "Favoured").slice(0, 4);
    const hardCounters = rated.filter((matchup) => verdictFor(matchup.engagement.exchange) === "Countered").reverse().slice(0, 4);
    return [
      renderMatchupHeader(unit, opponent),
      renderTiming(unit),
      renderSection("Ideal targets", "", renderMatchupCards(idealTargets, opponent)),
      renderSection("Hard counters", "", renderMatchupCards(hardCounters, opponent)),
      renderSection("Engagement distance", "Closing times not yet verified in game",
        renderEngagementTable(matchups, opponent)),
      renderArmsRace(unit, matchups, opponent),
      renderSection("Every matchup", "Full squads, default weapons, before research", renderMatchupTable(matchups, opponent)),
      renderMatchupGuide(),
    ].join("");
  }

  const ECONOMY_LIMIT = 20;
  const economyLimitFor = (race, key) => (key === "generators" && race.economy.generator && race.economy.generator.limit)
    || ECONOMY_LIMIT;

  const enemyById = (enemyId) => opponentRace.units.find((enemy) => enemy.id === enemyId);

  function changeFightSetup({ fightEnemy, fightSide, fightAction }) {
    const enemy = enemyById(fightEnemy);
    const setup = fightSetupOf(currentUnit, enemy);
    const [squad, rival] = fightSide === "you" ? [currentUnit, enemy] : [enemy, currentUnit];
    const sideSetup = setup[fightSide];
    const rivalSetup = setup[fightSide === "you" ? "them" : "you"];
    const [action, offerIndex] = fightAction.split("-");
    const rules = buyingRulesOf(squad, sideSetup.withResearch);
    const offer = rules.offers[offerIndex];
    if (action === "research") {
      sideSetup.withResearch = !sideSetup.withResearch;
      sideSetup.buys = buyingRulesOf(squad, sideSetup.withResearch).keepAllowed(sideSetup.buys);
    } else if (action === "best") {
      sideSetup.buys = bestBuysAgainst(squad, unbuiltProfileOf(rival, rivalSetup.withResearch), sideSetup.withResearch).buys;
    } else if (action === "none") {
      sideSetup.buys = [];
    } else if (action === "more" && rules.canBuy(sideSetup.buys, offer)) {
      sideSetup.buys = [...sideSetup.buys, offer];
    } else if (action === "fewer" && sideSetup.buys.includes(offer)) {
      const removedIndex = sideSetup.buys.lastIndexOf(offer);
      sideSetup.buys = sideSetup.buys.filter((_, index) => index !== removedIndex);
    }
  }

  function changeMatchupSettings(event) {
    if (event.target.closest("a")) return;
    const opponentButton = event.target.closest("[data-opponent]");
    const scopeButton = event.target.closest("[data-enemy-scope]");
    const economyButton = event.target.closest("[data-economy]");
    const fightButton = event.target.closest("[data-fight-action]");
    const fightRow = event.target.closest("[data-fight]");
    if (opponentButton) opponentRace = data.races.find((race) => race.id === opponentButton.dataset.opponent);
    else if (scopeButton) enemyScope = scopeButton.dataset.enemyScope;
    else if (economyButton) {
      const { economy: key, step } = economyButton.dataset;
      const current = Math.min(economyAssumptions[key], economyLimitFor(currentRace, key));
      economyAssumptions[key] = Math.min(economyLimitFor(currentRace, key), Math.max(0, current + Number(step)));
    } else if (fightButton) changeFightSetup(fightButton.dataset);
    else if (fightRow) {
      const setup = fightSetupOf(currentUnit, enemyById(fightRow.dataset.fight));
      setup.isOpen = !setup.isOpen;
    } else return;
    const clickedButton = event.target.closest("button");
    const focusId = clickedButton && clickedButton.id;
    unitPage.dataset.update = "settings";
    refreshPage();
    const focusTarget = focusId && document.getElementById(focusId);
    if (focusTarget) focusTarget.focus();
  }

  function followHash() {
    const hash = decodeURIComponent(location.hash.slice(1));
    const isMatchup = hash.startsWith(MATCHUP_HASH_PREFIX);
    const [unitId, opponentId] = isMatchup ? hash.slice(MATCHUP_HASH_PREFIX.length).split("/") : [hash];
    if (isMatchup) opponentRace = data.races.find((race) => race.id === opponentId) || null;
    currentView = isMatchup ? "matchups" : "units";
    viewSwitch.querySelectorAll("[data-view]")
      .forEach((button) => button.setAttribute("aria-pressed", button.dataset.view === currentView));
    renderUnitList();
    if (!isMatchup && raceWithSpell(unitId)) showSpell(unitId);
    else showUnit(unitId || currentRace.units[0].id);
  }

  function showRaceFromBar(event) {
    const button = event.target.closest(".race-btn");
    const race = button && data.races.find((candidate) => candidate.id === button.dataset.race);
    if (!race || race === currentRace) return;
    searchInput.value = "";
    showRace(race);
    showUnit(lastViewedUnitIdByRace[race.id] || race.units[0].id);
  }

  function moveListSelection(event) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = [...unitList.querySelectorAll(".unit-btn")];
    const step = event.key === "ArrowDown" ? 1 : -1;
    const nextButton = buttons[Math.min(buttons.length - 1, Math.max(0, buttons.indexOf(document.activeElement) + step))];
    if (!nextButton) return;
    event.preventDefault();
    nextButton.focus();
    openListItem(nextButton, false);
  }

  function focusSearchOnSlash(event) {
    if (event.key !== "/" || document.activeElement === searchInput) return;
    event.preventDefault();
    searchInput.focus();
  }

  if (data.races.length > 1) {
    raceBar.innerHTML = data.races.map((race) => `<button class="race-btn" data-race="${escapeHtml(race.id)}" aria-pressed="false"
      title="${escapeHtml(race.name)}">${escapeHtml(race.short || race.name)}</button>`).join("");
    raceBar.hidden = false;
    raceBar.addEventListener("click", showRaceFromBar);
  }
  searchInput.addEventListener("input", renderUnitList);
  unitList.addEventListener("click", (event) => {
    const button = event.target.closest(".unit-btn");
    if (button) openListItem(button, true);
  });
  unitList.addEventListener("keydown", moveListSelection);
  document.addEventListener("keydown", focusSearchOnSlash);
  viewSwitch.addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (button && button.dataset.view !== currentView) showView(button.dataset.view);
  });
  unitPage.addEventListener("click", changeMatchupSettings);
  window.addEventListener("hashchange", followHash);

  showRace(currentRace);
  followHash();
})();

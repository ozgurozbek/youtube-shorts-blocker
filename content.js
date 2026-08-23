let removeShortsEnabled = true;
let removePlayablesEnabled = true;
let extensionEnabled = true;

let filterKeywords = [];
let customSelectors = [];
let blockedCount = 0;

let observerScheduled = false;
let currentURL = window.location.href;


// ------------------------------------------------------------
// Settings
// ------------------------------------------------------------

function loadSettings(callback) {
  chrome.storage.local.get(
    [
      'removeShortsEnabled',
      'removePlayablesEnabled',
      'extensionEnabled',
      'filterKeywords',
      'customSelectors',
      'blockedCount'
    ],
    (data) => {
      removeShortsEnabled = data.removeShortsEnabled ?? true;
      removePlayablesEnabled = data.removePlayablesEnabled ?? true;
      extensionEnabled = data.extensionEnabled ?? true;

      filterKeywords = Array.isArray(data.filterKeywords)
        ? data.filterKeywords
        : [];

      customSelectors = Array.isArray(data.customSelectors)
        ? data.customSelectors
        : [];

      blockedCount = data.blockedCount ?? 0;

      if (callback) {
        callback();
      }
    }
  );
}


function saveBlockedCount() {
  chrome.storage.local.set({ blockedCount });
}


function incrementBlockedCount() {
  blockedCount++;
}


// ------------------------------------------------------------
// Utility
// ------------------------------------------------------------

function getText(element) {
  return (element.textContent || '').trim().toLowerCase();
}


function containsBlockedKeyword(text) {
  if (!text || filterKeywords.length === 0) {
    return false;
  }

  return filterKeywords.some((keyword) => {
    const normalizedKeyword = String(keyword).trim().toLowerCase();

    return normalizedKeyword.length > 0 &&
      text.includes(normalizedKeyword);
  });
}


function removeElement(element) {
  if (!element || !element.isConnected) {
    return false;
  }

  element.remove();
  incrementBlockedCount();

  return true;
}


function querySelectorAllSafe(selector) {
  try {
    return document.querySelectorAll(selector);
  } catch (error) {
    console.warn(
      `[Remove Shorts & Filter Content] Invalid CSS selector: ${selector}`,
      error
    );

    return [];
  }
}


// ------------------------------------------------------------
// 1. Remove Shorts
//
// This operation is completely independent of keywords and
// custom selectors.
// ------------------------------------------------------------

function removeShorts() {
  if (!extensionEnabled || !removeShortsEnabled) {
    return;
  }

  let removed = false;

  // Known Shorts shelves.
  const shortsShelves = document.querySelectorAll(
    [
      'ytd-rich-shelf-renderer[is-shorts]',
      'ytd-reel-shelf-renderer'
    ].join(', ')
  );

  shortsShelves.forEach((shelf) => {
    if (removeElement(shelf)) {
      removed = true;
    }
  });


  // Shorts links.

  const shortsLinks = document.querySelectorAll(
    [
      'a[href*="/shorts/"]',
      'a[href^="/shorts"]',
      'a[href*="youtube.com/shorts/"]'
    ].join(', ')
  );

  shortsLinks.forEach((link) => {
    /*
     * Find the complete video/card container rather than removing
     * the <a> itself.
     *
     * Newer YouTube layouts may use the ViewModel classes while
     * older layouts use the ytd-* renderers.
     */
    const container =
      link.closest(
        [
          'ytd-video-renderer',
          'ytd-grid-video-renderer',
          'ytd-rich-item-renderer',
          'ytd-rich-grid-media',
          'ytd-compact-video-renderer',
          'ytd-video-meta-block',
          '.shortsLockupViewModelHost',
          '.ytGridShelfViewModelHost'
        ].join(', ')
      ) || link;

    if (removeElement(container)) {
      removed = true;
    }
  });


  // Newer YouTube Shorts ViewModel components.

  const shortsViewModels = document.querySelectorAll(
    [
      '.shortsLockupViewModelHost',
      '.shortsLockupViewModelHostOutsideMetadata',
      '.shortsLockupViewModelHostThumbnailParentContainer'
    ].join(', ')
  );

  shortsViewModels.forEach((element) => {
    /*
     * Prefer the complete Shorts item if one exists.
     * Otherwise remove the matched element itself.
     */
    const container =
      element.closest(
        [
          '.shortsLockupViewModelHost',
          'ytd-rich-item-renderer',
          'ytd-grid-video-renderer',
          'ytd-video-renderer'
        ].join(', ')
      ) || element;

    if (removeElement(container)) {
      removed = true;
    }
  });


  // Shorts shelves represented by newer Grid Shelf ViewModels.

  const gridShelfRows = document.querySelectorAll(
    [
      '.ytGridShelfViewModelGridShelfRow'
    ].join(', ')
  );

  gridShelfRows.forEach((row) => {
    if (removeElement(row)) {
      removed = true;
    }
  });


  // Shorts menu items.

  const shortsButtons = document.querySelectorAll(
    [
      'tp-yt-paper-item[title*="Shorts"]',
      '[title="Shorts"]',
      '[aria-label*="Shorts"]'
    ].join(', ')
  );

  shortsButtons.forEach((button) => {
    if (removeElement(button)) {
      removed = true;
    }
  });


  if (removed) {
    saveBlockedCount();
  }
}


// ------------------------------------------------------------
// 2. Remove Playables
//
// Completely independent from Shorts and keyword filtering.
// ------------------------------------------------------------

function removePlayables() {
  if (!extensionEnabled || !removePlayablesEnabled) {
    return;
  }

  let removed = false;

  const playableSelectors = [
    'ytd-playable-video-renderer',
    'ytd-interactive-companion-ad-renderer',
    '.ytp-playable-panel-video-renderer',
    '.ytp-cued-thumbnail-overlay',
    'ytd-game-renderer',
    'tp-yt-paper-item[title*="Playables"]',
    '[title="Playables"]',
    '[aria-label*="Playables"]'
  ];

  const playables = document.querySelectorAll(
    playableSelectors.join(', ')
  );

  playables.forEach((playable) => {
    if (removeElement(playable)) {
      removed = true;
    }
  });


  if (removed) {
    saveBlockedCount();
  }
}


// ------------------------------------------------------------
// 3. Filter videos by keyword
//
// This operation only examines actual video containers.
// It does NOT use custom selectors.
// ------------------------------------------------------------

function filterVideos() {
  if (
    !extensionEnabled ||
    filterKeywords.length === 0
  ) {
    return;
  }

  let removed = false;

  const videoContainers = [
    'ytd-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-rich-item-renderer',
    'ytd-rich-grid-media',
    'ytd-compact-video-renderer',
    'ytd-playlist-video-renderer'
  ];


  document
    .querySelectorAll(videoContainers.join(', '))
    .forEach((container) => {

      if (!container.isConnected) {
        return;
      }

      /*
       * Use the title when available, but fall back to the complete
       * container text. This catches titles represented by YouTube's
       * newer ViewModel markup.
       */
      const titleElement =
        container.querySelector(
          [
            '#video-title',
            'a.yt-lockup-metadata-view-model__title',
            'a.yt-simple-endpoint.style-scope.ytd-rich-grid-media',
            'h3',
            '[id="video-title"]'
          ].join(', ')
        );

      const text = titleElement
        ? getText(titleElement)
        : getText(container);

      if (containsBlockedKeyword(text)) {
        if (removeElement(container)) {
          removed = true;
        }
      }
    });


  if (removed) {
    saveBlockedCount();
  }
}


// ------------------------------------------------------------
// 4. Remove elements matching custom CSS selectors
//
// This operation is completely independent from keywords.
//
// If the user enters:
//
//     .some-class
//
// every matching element is removed.
//
// No keyword must match.
// ------------------------------------------------------------

function applyCustomSelectors() {
  if (
    !extensionEnabled ||
    customSelectors.length === 0
  ) {
    return;
  }

  let removed = false;

  customSelectors.forEach((selector) => {
    const elements = querySelectorAllSafe(selector);

    elements.forEach((element) => {
      if (removeElement(element)) {
        removed = true;
      }
    });
  });


  if (removed) {
    saveBlockedCount();
  }
}


// ------------------------------------------------------------
// Run all independent filters
// ------------------------------------------------------------

function runFilters() {
  if (!extensionEnabled) {
    return;
  }

  /*
   * These are intentionally separate operations.
   *
   * 1. Shorts
   * 2. Playables
   * 3. Keyword videos
   * 4. Custom CSS selectors
   */
  removeShorts();
  removePlayables();
  filterVideos();
  applyCustomSelectors();
}


// ------------------------------------------------------------
// MutationObserver
//
// YouTube is a SPA and continuously adds/removes DOM nodes.
// Debouncing prevents our own removals from causing a cascade of
// repeated synchronous filtering passes.
// ------------------------------------------------------------

function scheduleFiltering() {
  if (observerScheduled) {
    return;
  }

  observerScheduled = true;

  requestAnimationFrame(() => {
    observerScheduled = false;

    if (extensionEnabled) {
      runFilters();
    }
  });
}


const observer = new MutationObserver(() => {
  scheduleFiltering();
});


function startObserver() {
  if (!document.body) {
    return;
  }

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}


// ------------------------------------------------------------
// SPA navigation
//
// pushState/replaceState are methods, not browser events, so
// addEventListener('pushState', ...) does not work.
// ------------------------------------------------------------

function checkURLChange() {
  if (window.location.href !== currentURL) {
    currentURL = window.location.href;
    scheduleFiltering();
  }
}


const originalPushState = history.pushState;
history.pushState = function (...args) {
  const result = originalPushState.apply(this, args);
  checkURLChange();
  return result;
};


const originalReplaceState = history.replaceState;
history.replaceState = function (...args) {
  const result = originalReplaceState.apply(this, args);
  checkURLChange();
  return result;
};


window.addEventListener('popstate', () => {
  checkURLChange();
});


// ------------------------------------------------------------
// Messages from popup
// ------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (request, sender, sendResponse) => {

    if (request.type !== 'updateSettings') {
      return;
    }

    removeShortsEnabled =
      request.removeShortsEnabled ?? removeShortsEnabled;

    removePlayablesEnabled =
      request.removePlayablesEnabled ?? removePlayablesEnabled;

    extensionEnabled =
      request.extensionEnabled ?? extensionEnabled;

    filterKeywords =
      Array.isArray(request.filterKeywords)
        ? request.filterKeywords
        : filterKeywords;

    customSelectors =
      Array.isArray(request.customSelectors)
        ? request.customSelectors
        : customSelectors;

    blockedCount =
      request.blockedCount ?? blockedCount;

    sendResponse({ success: true });

    if (extensionEnabled) {
      scheduleFiltering();
    }

    return true;
  }
);


// ------------------------------------------------------------
// Initialisation
// ------------------------------------------------------------

loadSettings(() => {
  startObserver();
  runFilters();
});
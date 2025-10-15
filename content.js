let removeShortsEnabled = true;
let removePlayablesEnabled = true;
let extensionEnabled = true;
let filterKeywords = [];
let blockedCount = 0;

// Load settings from storage
chrome.storage.local.get(
  ['removeShortsEnabled', 'removePlayablesEnabled', 'extensionEnabled', 'filterKeywords', 'blockedCount'],
  (data) => {
    removeShortsEnabled = data.removeShortsEnabled ?? true;
    removePlayablesEnabled = data.removePlayablesEnabled ?? true;
    extensionEnabled = data.extensionEnabled ?? true;
    filterKeywords = data.filterKeywords ?? [];
    blockedCount = data.blockedCount ?? 0;
  }
);

// Save blocked count
function saveBlockedCount() {
  chrome.storage.local.set({ blockedCount });
}

// Remove Shorts and Reels
function removeShorts() {
  if (!extensionEnabled || !removeShortsEnabled) return;

  // Remove Shorts/Reels shelves
  const shortsShelves = document.querySelectorAll('ytd-rich-shelf-renderer[is-shorts], ytd-reel-shelf-renderer');
  shortsShelves.forEach((shelf) => {
    shelf.remove();
    blockedCount++;
    saveBlockedCount();
  });

  // Remove Shorts/Reels links
  const shortsLinks = document.querySelectorAll('a[href*="/shorts"], a[href*="/reels"]');
  shortsLinks.forEach((link) => {
    const parent = link.closest('ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer');
    if (parent) {
      parent.remove();
      blockedCount++;
      saveBlockedCount();
    }
  });

  // Remove Shorts/Reels buttons from YouTube UI (menu)
  const shortsButtons = document.querySelectorAll('tp-yt-paper-item[title*="Shorts"], tp-yt-paper-item[title*="Reels"], [title="Shorts"]');
  shortsButtons.forEach((button) => {
    button.remove();
    blockedCount++;
    saveBlockedCount();
  });
}

// Remove playable content (including games)
function removePlayables() {
  if (!extensionEnabled || !removePlayablesEnabled) return;

  // Selectors for playables (trailers, ads, interactive items, and games)
  const playableSelectors = [
    'ytd-playable-video-renderer',
    'ytd-interactive-companion-ad-renderer',
    '.ytp-playable-panel-video-renderer', // Playables panel videos?
    '.ytp-cued-thumbnail-overlay',       // Interactive overlays
    'tp-yt-paper-item[title*="Playables"]', // Playables button
    'ytd-game-renderer', // For interactive games on YouTube (playable games)
  ];
  const playables = document.querySelectorAll(playableSelectors.join(', '));
  playables.forEach((playable) => {
    playable.remove();
    blockedCount++;
    saveBlockedCount();
  });

  // Remove Playables button from the menu (YouTube UI)
  const playablesButtons = document.querySelectorAll('tp-yt-paper-item[title*="Playables"], [title="Playables"]');
  playablesButtons.forEach((button) => {
    button.remove();
    blockedCount++;
    saveBlockedCount();
  });
}

// Filter videos by keywords and custom selectors
function filterVideos() {
  if (!extensionEnabled || filterKeywords.length === 0) return;

  // Default selectors for video titles and containers
  const defaultContainers = [
    'ytd-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-rich-item-renderer',
  ];

  // Selectors for title elements inside containers
  const titleSelectors = [
    '#video-title',
    'a.yt-lockup-metadata-view-model__title',
    'a.yt-simple-endpoint.style-scope.ytd-rich-grid-media',
  ];

  // Remove videos matching keywords in default containers
  defaultContainers.forEach((containerSelector) => {
    const containers = document.querySelectorAll(containerSelector);
    containers.forEach((container) => {
      let titleText = '';
      for (const titleSelector of titleSelectors) {
        const titleElem = container.querySelector(titleSelector);
        if (titleElem && titleElem.textContent) {
          titleText = titleElem.textContent.toLowerCase();
          break;
        }
      }
      if (titleText && filterKeywords.some((keyword) => titleText.includes(keyword.toLowerCase()))) {
        container.remove();
        blockedCount++;
        saveBlockedCount();
      }
    });
  });

  // Also filter by user-provided custom selectors
  if (customSelectors && customSelectors.length > 0) {
    customSelectors.forEach((selector) => {
      const elements = document.querySelectorAll(selector);
      elements.forEach((elem) => {
        const text = elem.textContent ? elem.textContent.toLowerCase() : '';
        if (filterKeywords.some((keyword) => text.includes(keyword.toLowerCase()))) {
          // Remove the closest container element or the element itself
          const container = elem.closest('ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer') || elem;
          container.remove();
          blockedCount++;
          saveBlockedCount();
        }
      });
    });
  }
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'updateSettings') {
    removeShortsEnabled = request.removeShortsEnabled;
    removePlayablesEnabled = request.removePlayablesEnabled;
    extensionEnabled = request.extensionEnabled;
    filterKeywords = request.filterKeywords;
    blockedCount = request.blockedCount || blockedCount;
    sendResponse({ success: true });
    if (extensionEnabled) {
      removeShorts();
      removePlayables();
      filterVideos();
    }
  }
});

// Observe dynamic page changes (new videos being loaded)
const observer = new MutationObserver(() => {
  if (extensionEnabled) {
    removeShorts();
    removePlayables();
    filterVideos();
  }
});

// Observe for changes in the body of the page (for new videos, etc.)
observer.observe(document.body, { childList: true, subtree: true });

// Listen for URL changes (YouTube doesn't fully reload the page)
let currentURL = window.location.href;

function onURLChange() {
  if (window.location.href !== currentURL) {
    currentURL = window.location.href;
    if (extensionEnabled) {
      removeShorts();
      removePlayables();
      filterVideos();
    }
  }
}

// Trigger on URL changes (for single-page navigation)
window.addEventListener('popstate', onURLChange);  // Detecting URL changes in a SPA like YouTube
window.addEventListener('pushState', onURLChange);  // For handling history pushState changes
window.addEventListener('replaceState', onURLChange);  // For handling history replaceState changes

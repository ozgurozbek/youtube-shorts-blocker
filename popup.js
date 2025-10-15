document.addEventListener('DOMContentLoaded', () => {
  const toggleShortsBtn = document.getElementById('toggle-shorts-btn');
  const togglePlayablesBtn = document.getElementById('toggle-playables-btn');
  const toggleExtensionBtn = document.getElementById('toggle-extension-btn');
  const filterInput = document.getElementById('filter-input');
  const customSelectorsInput = document.getElementById('custom-selectors-input');
  const blockedCounter = document.getElementById('blocked-counter');

  // Load settings from storage
  chrome.storage.local.get(
    ['removeShortsEnabled', 'removePlayablesEnabled', 'extensionEnabled', 'filterKeywords', 'blockedCount', 'customSelectors'],
    (data) => {
      const removeShortsEnabled = data.removeShortsEnabled ?? true;
      const removePlayablesEnabled = data.removePlayablesEnabled ?? true;
      const extensionEnabled = data.extensionEnabled ?? true;
      const filterKeywords = data.filterKeywords ?? [];
      const blockedCount = data.blockedCount ?? 0;
      const customSelectors = data.customSelectors ?? [];

      toggleShortsBtn.textContent = removeShortsEnabled
        ? 'Disable Shorts Removal'
        : 'Enable Shorts Removal';
      togglePlayablesBtn.textContent = removePlayablesEnabled
        ? 'Disable Playables Removal'
        : 'Enable Playables Removal';
      toggleExtensionBtn.textContent = extensionEnabled
        ? 'Disable Extension'
        : 'Enable Extension';
      filterInput.value = filterKeywords.join('\n');
      customSelectorsInput.value = customSelectors.join('\n');
      blockedCounter.textContent = `Blocked: ${blockedCount}`;
    }
  );

  // Toggle Shorts Removal
  toggleShortsBtn.addEventListener('click', () => {
    chrome.storage.local.get('removeShortsEnabled', (data) => {
      const currentState = data.removeShortsEnabled ?? true;
      const newState = !currentState;
      chrome.storage.local.set({ removeShortsEnabled: newState }, () => {
        toggleShortsBtn.textContent = newState
          ? 'Disable Shorts Removal'
          : 'Enable Shorts Removal';
        sendUpdateMessage();
      });
    });
  });

  // Toggle Playables Removal
  togglePlayablesBtn.addEventListener('click', () => {
    chrome.storage.local.get('removePlayablesEnabled', (data) => {
      const currentState = data.removePlayablesEnabled ?? true;
      const newState = !currentState;
      chrome.storage.local.set({ removePlayablesEnabled: newState }, () => {
        togglePlayablesBtn.textContent = newState
          ? 'Disable Playables Removal'
          : 'Enable Playables Removal';
        sendUpdateMessage();
      });
    });
  });

  // Toggle Extension
  toggleExtensionBtn.addEventListener('click', () => {
    chrome.storage.local.get('extensionEnabled', (data) => {
      const currentState = data.extensionEnabled ?? true;
      const newState = !currentState;
      chrome.storage.local.set({ extensionEnabled: newState }, () => {
        toggleExtensionBtn.textContent = newState
          ? 'Disable Extension'
          : 'Enable Extension';
        sendUpdateMessage();
      });
    });
  });

  // Save filter keywords
  filterInput.addEventListener('input', () => {
    const keywords = filterInput.value
      .split('\n')
      .map((keyword) => keyword.trim())
      .filter(Boolean);
    chrome.storage.local.set({ filterKeywords: keywords }, sendUpdateMessage);
  });

  // Save custom selectors
  customSelectorsInput.addEventListener('input', () => {
    const selectors = customSelectorsInput.value
      .split('\n')
      .map((sel) => sel.trim())
      .filter(Boolean);
    chrome.storage.local.set({ customSelectors: selectors }, sendUpdateMessage);
  });

  // Send settings update message to content script
  function sendUpdateMessage() {
    chrome.storage.local.get(
      ['removeShortsEnabled', 'removePlayablesEnabled', 'extensionEnabled', 'filterKeywords', 'blockedCount', 'customSelectors'],
      (data) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'updateSettings',
            removeShortsEnabled: data.removeShortsEnabled,
            removePlayablesEnabled: data.removePlayablesEnabled,
            extensionEnabled: data.extensionEnabled,
            filterKeywords: data.filterKeywords,
            blockedCount: data.blockedCount,
            customSelectors: data.customSelectors || [],
          });
        });
      }
    );
  }
});

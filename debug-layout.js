// Paste this into DevTools console when on the chat screen
// It will log all the layout information we need

function debugLayout() {
  const elements = {
    html: document.documentElement,
    body: document.body,
    root: document.getElementById('root'),
    appContainer: document.querySelector('.app-container'),
    chatWindow: document.querySelector('.chat-window'),
    chatHeader: document.querySelector('.chat-header'),
    messagesArea: document.querySelector('.messages-area'),
    inputArea: document.querySelector('.input-area')
  };

  console.log('=== LAYOUT DEBUG INFO ===\n');

  Object.entries(elements).forEach(([name, el]) => {
    if (!el) {
      console.log(`❌ ${name}: NOT FOUND`);
      return;
    }

    const computed = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();

    console.log(`\n📦 ${name}:`);
    console.log(`  Position: ${computed.position}`);
    console.log(`  Display: ${computed.display}`);
    if (computed.display === 'flex') {
      console.log(`    flex-direction: ${computed.flexDirection}`);
      console.log(`    align-items: ${computed.alignItems}`);
      console.log(`    justify-content: ${computed.justifyContent}`);
    }
    console.log(`  Width: ${computed.width} (${rect.width}px actual)`);
    console.log(`  Height: ${computed.height} (${rect.height}px actual)`);
    console.log(`  Margin: ${computed.marginTop} ${computed.marginRight} ${computed.marginBottom} ${computed.marginLeft}`);
    console.log(`  Padding: ${computed.paddingTop} ${computed.paddingRight} ${computed.paddingBottom} ${computed.paddingLeft}`);
    console.log(`  BoundingRect: top=${rect.top.toFixed(2)}, left=${rect.left.toFixed(2)}`);
    console.log(`  Overflow: ${computed.overflow} (x: ${computed.overflowX}, y: ${computed.overflowY})`);
  });

  console.log('\n=== VIEWPORT INFO ===');
  console.log(`Window: ${window.innerWidth}x${window.innerHeight}`);
  console.log(`Document: ${document.documentElement.clientWidth}x${document.documentElement.clientHeight}`);

  // Check if chat-header is visible
  const header = elements.chatHeader;
  if (header) {
    const headerRect = header.getBoundingClientRect();
    console.log('\n=== CHAT HEADER VISIBILITY ===');
    console.log(`Header top: ${headerRect.top}`);
    console.log(`Header is ${headerRect.top < 0 ? '⚠️ CUT OFF (above viewport)' : '✅ VISIBLE'}`);
    console.log(`Header height: ${headerRect.height}`);
  }

  console.log('\n=== END DEBUG ===');
}

debugLayout();

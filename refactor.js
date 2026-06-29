const fs = require('fs');
const file = 'frontend/src/components/page/layout/VoicePanel.tsx';
let lines = fs.readFileSync(file, 'utf8').split('\n');

// Import MediaSection
const importLine = `import { MediaSection } from "./voice/MediaSection";`;
lines.splice(47, 0, importLine);

// We need to re-evaluate line numbers because we added 1 line!
// Let's find the hooks start/end dynamically to be safe.
const hooksStart = lines.findIndex(l => l.includes('const transitioningItemId = mediaState?.transitioning_item_id || null;'));
const hooksEnd = lines.findIndex(l => l.includes('const isMutedByAdmin = currentUser && permissions.mutedUsers[Number(currentUser.id)];'));

if (hooksStart !== -1 && hooksEnd !== -1) {
    lines.splice(hooksStart, hooksEnd - hooksStart);
}

const jsxStart = lines.findIndex(l => l.includes('className="vp-media-section ui-panel"'));
// Find where AdminSettings is
const jsxEnd = lines.findIndex(l => l.includes('<AdminSettings />'));

if (jsxStart !== -1 && jsxEnd !== -1) {
    // We want to replace from the { !voiceOnly && ( ... )} wrapper
    const jsxWrapperStart = jsxStart - 1; // {!voiceOnly && (
    
    const replacement = `      {!voiceOnly && (
        <MediaSection
          mediaState={mediaState}
          socket={socket}
          location={location}
          myPresenceId={myPresenceId as number}
          currentUser={currentUser}
          onlineUsers={onlineUsers}
          isPlayerMuted={isPlayerMuted}
          hasManagePermission={hasManagePermission}
          playTransitionSound={playTransitionSound}
        />
      )}`;
      
    // Replace the chunk
    lines.splice(jsxWrapperStart, jsxEnd - jsxWrapperStart - 1, replacement);
}

fs.writeFileSync(file, lines.join('\n'));
console.log("Refactored VoicePanel!");

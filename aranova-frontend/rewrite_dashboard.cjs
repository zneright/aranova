const fs = require('fs');
const file = 'src/pages/user/UserDashboard.tsx';
let lines = fs.readFileSync(file, 'utf8').split('\n');

// Find the orphaned return block start and end
const orphanStart = lines.findIndex((l, i) => i > 900 && l.trim() === 'return (');
const orphanEnd = lines.findIndex((l, i) => i > orphanStart && l.trim() === 'const UserDashboard: React.FC = () => {');

if (orphanStart === -1 || orphanEnd === -1) {
    console.error('Cannot find boundaries:', orphanStart, orphanEnd);
    process.exit(1);
}

console.log(`Removing lines ${orphanStart + 1} to ${orphanEnd} (orphaned return block)`);

// Remove lines from orphanStart to orphanEnd - 1 (keep const UserDashboard line)
lines.splice(orphanStart, orphanEnd - orphanStart);

fs.writeFileSync(file, lines.join('\n'), 'utf8');
console.log('Done! Orphaned block removed.');

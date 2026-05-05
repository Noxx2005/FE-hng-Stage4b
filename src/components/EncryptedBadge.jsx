import { LockKeyhole } from 'lucide-react';

export default function EncryptedBadge() {
  return (
    <div className="encrypted-badge">
      <LockKeyhole size={14} />
      <span>End-to-end encrypted</span>
    </div>
  );
}

import React, { useState } from 'react';
import {
  Search,
  UserPlus,
  Plus,
  Trophy,
  Copy,
  Check,
  LogIn,
} from 'lucide-react';
import {
  FriendRequestItem,
  StudentFriend,
  StudyRoom,
  ThemeMode,
  UserProfileState,
} from '../types';
import {
  generateDeterministicFriendCode,
  isTestSubject,
} from '../utils/academicRules';

interface StudyFriendsTabProps {
  theme: ThemeMode;
  profile: UserProfileState;
  friends: StudentFriend[];
  incomingRequests: FriendRequestItem[];
  rooms: StudyRoom[];
  onAddFriendByCode: (queryStr: string) => void;
  onAcceptFriendRequest: (req: FriendRequestItem) => void;
  onCreateRoom: (name: string, subject: string, targetMins: number) => void;
  onJoinRoomByCode: (code: string) => void;
}

export const StudyFriendsTab: React.FC<StudyFriendsTabProps> = ({
  theme,
  profile,
  friends,
  incomingRequests,
  rooms,
  onAddFriendByCode,
  onAcceptFriendRequest,
  onCreateRoom,
  onJoinRoomByCode,
}) => {
  const isLight = theme === 'warm';

  const [friendSearchInput, setFriendSearchInput] = useState('');
  const [friendNotice, setFriendNotice] = useState<string | null>(null);
  const [copiedMyCode, setCopiedMyCode] = useState(false);

  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomSubject, setNewRoomSubject] = useState('Physics & Mathematics');
  const [newRoomTarget, setNewRoomTarget] = useState(1500);
  const [joinRoomCodeInput, setJoinRoomCodeInput] = useState('');
  const [activeRoomId, setActiveRoomId] = useState<string>(
    rooms[0]?.id || 'room-caie-stem'
  );

  const verifiedFriends = friends.filter(
    (f) => !isTestSubject(f.displayName) && !isTestSubject(f.username)
  );

  const activeRoom =
    rooms.find((r) => r.id === activeRoomId) || rooms[0] || null;

  const handleSendFriendRequest = (e: React.FormEvent) => {
    e.preventDefault();
    const q = friendSearchInput.trim();
    if (!q) return;
    if (isTestSubject(q)) {
      setFriendNotice('Simulated test accounts are blocked.');
      return;
    }
    onAddFriendByCode(q);
    setFriendNotice(
      `Added scholar "${q}" (Code #${
        /^[0-9]{5}$/.test(q) ? q : generateDeterministicFriendCode(q)
      }).`
    );
    setFriendSearchInput('');
  };

  const handleCreateRoomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    onCreateRoom(
      newRoomName.trim(),
      newRoomSubject.trim() || 'General Revision',
      Math.max(300, Number(newRoomTarget) || 1500)
    );
    setNewRoomName('');
  };

  const handleJoinRoomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinRoomCodeInput.trim()) return;
    onJoinRoomByCode(joinRoomCodeInput.trim());
    setJoinRoomCodeInput('');
  };

  const cardSurface = isLight
    ? 'bg-white border-[#E2E8F0] text-[#0F172A] shadow-[0_1px_2px_rgba(15,23,42,0.03)]'
    : 'bg-[#111827] border-white/10 text-[#F8FAFC]';
  const inputSurface = isLight
    ? 'bg-[#F8FAFC] border-[#E2E8F0] text-[#0F172A] focus:bg-white focus:border-[#0F172A]'
    : 'bg-[#090D16] border-white/10 text-[#F8FAFC] focus:border-[#6366F1]';
  const mutedText = isLight ? 'text-[#64748B]' : 'text-[#94A3B8]';
  const primaryBtn = isLight
    ? 'bg-[#0F172A] hover:bg-[#1E293B] text-white'
    : 'bg-[#6366F1] hover:bg-[#4F46E5] text-white';

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Minimalist Header & Friend Code */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Study Friends &amp; Rooms
          </h1>
          <p className={`text-xs mt-1 ${mutedText}`}>
            Connect via 5-digit scholar codes and study together
          </p>
        </div>

        <div
          className={`inline-flex items-center gap-3 px-4 py-2 rounded-xl border self-start sm:self-auto ${cardSurface}`}
        >
          <div className="text-xs">
            <span className={mutedText}>Your Code: </span>
            <strong className="font-mono-tabular">#{profile.friendCode}</strong>
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard
                .writeText(profile.friendCode)
                .catch(() => {});
              setCopiedMyCode(true);
              setTimeout(() => setCopiedMyCode(false), 1800);
            }}
            className={`px-2.5 py-1 rounded-lg border text-xs font-medium flex items-center gap-1 ${
              isLight
                ? 'border-[#E2E8F0] hover:bg-[#F8FAFC]'
                : 'border-white/10 hover:bg-white/5'
            }`}
          >
            {copiedMyCode ? (
              <>
                <Check className="w-3 h-3 text-emerald-500" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                Copy
              </>
            )}
          </button>
        </div>
      </div>

      {/* Add Friend Search Bar */}
      <section className={`rounded-2xl border p-5 ${cardSurface}`}>
        <form
          onSubmit={handleSendFriendRequest}
          className="flex flex-col sm:flex-row gap-3 text-xs"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-40" />
            <input
              type="text"
              aria-label="Search scholar by 5-digit code or name"
              value={friendSearchInput}
              onChange={(e) => setFriendSearchInput(e.target.value)}
              placeholder="Enter 5-digit scholar code (e.g. 48291) or classmate name..."
              className={`w-full pl-9 pr-3.5 py-2.5 rounded-xl border outline-none transition-colors ${inputSurface}`}
            />
          </div>
          <button
            type="submit"
            className={`px-5 py-2.5 rounded-xl font-semibold flex items-center justify-center gap-2 whitespace-nowrap ${primaryBtn}`}
          >
            <UserPlus className="w-4 h-4" />
            Add Friend
          </button>
        </form>

        {friendNotice && (
          <div className="mt-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs">
            {friendNotice}
          </div>
        )}

        {incomingRequests.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-xs font-semibold">Incoming Requests</div>
            {incomingRequests.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between p-3 rounded-xl border border-current/10 text-xs"
              >
                <span>
                  <strong>{req.fromName}</strong> (#{req.fromCode})
                </span>
                <button
                  type="button"
                  onClick={() => onAcceptFriendRequest(req)}
                  className={`px-3 py-1.5 rounded-lg font-semibold ${primaryBtn}`}
                >
                  Accept
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Main Split: Study Rooms + Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className={`lg:col-span-5 rounded-2xl border p-6 space-y-5 ${cardSurface}`}>
          <h2 className="text-sm font-semibold">Study Rooms</h2>

          <div className="space-y-2">
            {rooms.map((rm) => (
              <button
                key={rm.id}
                type="button"
                onClick={() => setActiveRoomId(rm.id)}
                className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                  activeRoom?.id === rm.id
                    ? isLight
                      ? 'bg-slate-100/80 border-[#0F172A]'
                      : 'bg-[#6366F1]/20 border-[#6366F1]'
                    : inputSurface
                }`}
              >
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span>{rm.name}</span>
                  <span className="font-mono-tabular">#{rm.roomCode}</span>
                </div>
                <div className={`text-[11px] mt-1 ${mutedText}`}>
                  {rm.subject} · Target: {rm.weeklyTargetMinutes}m
                </div>
              </button>
            ))}
          </div>

          <form
            onSubmit={handleJoinRoomSubmit}
            className="pt-4 border-t border-current/5 space-y-2 text-xs"
          >
            <label
              htmlFor="join-room-code"
              className={`block font-medium ${mutedText}`}
            >
              Join Room by 5-Digit Code
            </label>
            <div className="flex gap-2">
              <input
                id="join-room-code"
                type="text"
                maxLength={5}
                value={joinRoomCodeInput}
                onChange={(e) => setJoinRoomCodeInput(e.target.value)}
                placeholder="e.g. 58392"
                className={`flex-1 rounded-xl border px-3 py-2 font-mono-tabular outline-none ${inputSurface}`}
              />
              <button
                type="submit"
                className={`px-3.5 py-2 rounded-xl font-semibold flex items-center gap-1.5 whitespace-nowrap ${primaryBtn}`}
              >
                <LogIn className="w-3.5 h-3.5" />
                Join
              </button>
            </div>
          </form>

          <form
            onSubmit={handleCreateRoomSubmit}
            className="pt-4 border-t border-current/5 space-y-3 text-xs"
          >
            <div className="font-semibold">Create New Room</div>
            <div>
              <input
                id="new-room-name"
                type="text"
                required
                aria-label="Room Name"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="e.g. Organic Chemistry Revision Group"
                className={`w-full rounded-xl border px-3 py-2 outline-none ${inputSurface}`}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                id="new-room-subject"
                type="text"
                aria-label="Subject Focus"
                value={newRoomSubject}
                onChange={(e) => setNewRoomSubject(e.target.value)}
                placeholder="Subjects"
                className={`w-full rounded-xl border px-3 py-2 outline-none ${inputSurface}`}
              />
              <input
                id="new-room-target"
                type="number"
                aria-label="Weekly Target Minutes"
                value={newRoomTarget}
                onChange={(e) => setNewRoomTarget(Number(e.target.value))}
                className={`w-full rounded-xl border px-3 py-2 font-mono-tabular outline-none ${inputSurface}`}
              />
            </div>
            <button
              type="submit"
              className={`w-full py-2.5 px-3 rounded-xl font-semibold flex items-center justify-center gap-1.5 ${primaryBtn}`}
            >
              <Plus className="w-4 h-4" />
              Create Study Room
            </button>
          </form>
        </section>

        {/* Leaderboard */}
        <section className={`lg:col-span-7 rounded-2xl border p-6 space-y-4 ${cardSurface}`}>
          <div className="flex items-center justify-between gap-4 pb-3 border-b border-current/5">
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" />
                {activeRoom ? activeRoom.name : 'Room Leaderboard'}
              </h2>
              <p className={`text-xs mt-0.5 ${mutedText}`}>
                Room <strong className="font-mono-tabular">#{activeRoom?.roomCode || '58392'}</strong> · Weekly Target: {activeRoom?.weeklyTargetMinutes || 1500}m
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className={`border-b border-current/5 ${mutedText}`}>
                  <th className="py-2.5 px-3 font-medium">Rank</th>
                  <th className="py-2.5 px-3 font-medium">Scholar</th>
                  <th className="py-2.5 px-3 font-medium">Status</th>
                  <th className="py-2.5 px-3 font-medium text-right">Streak</th>
                  <th className="py-2.5 px-3 font-medium text-right">
                    Weekly Focus
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-current/5">
                {[
                  {
                    uid: profile.uid,
                    displayName: `${profile.displayName || 'Scholar'} (You)`,
                    username: profile.username,
                    friendCode: profile.friendCode,
                    status: profile.status,
                    weeklyFocusMinutes: Object.values(
                      profile.weeklyFocusLog
                    ).reduce((a, b) => a + b, 0),
                    streak: profile.streak,
                    level: profile.level,
                    xp: profile.xp,
                  },
                  ...verifiedFriends,
                ]
                  .sort((a, b) => b.weeklyFocusMinutes - a.weeklyFocusMinutes)
                  .map((member, index) => (
                    <tr key={member.uid} className="hover:bg-current/2">
                      <td className="py-3 px-3 font-mono-tabular font-semibold">
                        #{index + 1}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold">{member.displayName}</div>
                        <div className={`text-[11px] font-mono-tabular ${mutedText}`}>
                          #{member.friendCode}
                        </div>
                      </td>
                      <td className="py-3 px-3">{member.status}</td>
                      <td className="py-3 px-3 text-right font-mono-tabular">
                        {member.streak}d
                      </td>
                      <td className="py-3 px-3 text-right font-mono-tabular font-semibold">
                        {member.weeklyFocusMinutes}m
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};

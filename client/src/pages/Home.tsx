import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Camera, Check, Crown, Dices, LogIn, RotateCcw, Sparkles, Users, X } from "lucide-react";
import { toast } from "sonner";
import {
  connectGameSocket,
  createGameRoom,
  joinGameRoom,
  storeSession,
} from "@/lib/gameSocket";

type EntryMode = "create" | "join";

export default function Home() {
  const [, setLocation] = useLocation();
  const [entryMode, setEntryMode] = useState<EntryMode>("create");
  const [displayName, setDisplayName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | undefined>();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
  };

  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => undefined);
    }
  }, [cameraOpen]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("This browser cannot open a camera. You can still join without a selfie.");
      return;
    }

    try {
      streamRef.current?.getTracks().forEach(track => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 720 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      setCameraOpen(true);
    } catch {
      setCameraError("Camera access was not granted. You can retry or continue without a selfie.");
    }
  };

  const captureSelfie = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      toast.error("The camera is still getting ready. Try again in a moment.");
      return;
    }

    const canvas = document.createElement("canvas");
    const outputSize = 320;
    const cropSize = Math.min(video.videoWidth, video.videoHeight);
    const sourceX = (video.videoWidth - cropSize) / 2;
    const sourceY = (video.videoHeight - cropSize) / 2;
    canvas.width = outputSize;
    canvas.height = outputSize;
    const context = canvas.getContext("2d");
    if (!context) {
      toast.error("This device could not capture the selfie.");
      return;
    }

    context.drawImage(video, sourceX, sourceY, cropSize, cropSize, 0, 0, outputSize, outputSize);
    setAvatarDataUrl(canvas.toDataURL("image/jpeg", 0.78));
    stopCamera();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    stopCamera();

    try {
      await connectGameSocket();
      const result = entryMode === "create"
        ? await createGameRoom(displayName, avatarDataUrl)
        : await joinGameRoom(roomCode.toUpperCase(), displayName, avatarDataUrl);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      storeSession(result.data.session);
      setLocation(`/room/${result.data.room.roomCode}`);
    } catch {
      toast.error("We could not connect to the game room. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="game-shell">
      <span aria-hidden="true" className="memphis-mark memphis-mark--circle left-[8%] top-28 hidden md:block" />
      <span aria-hidden="true" className="memphis-mark memphis-mark--diamond right-[13%] top-24 hidden lg:block" />
      <span aria-hidden="true" className="memphis-mark memphis-mark--dash bottom-28 right-[8%] hidden md:block" />

      <div className="container relative z-10 py-5 sm:py-7">
        <header className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <button type="button" onClick={() => setLocation("/")} className="group flex items-center gap-2 text-left" aria-label="The Ego and ID Game home">
            <span className="grid size-10 place-items-center rounded-xl border-2 border-[#171113] bg-[#fff06e] shadow-[3px_3px_0_#171113] transition-transform duration-150 group-hover:-translate-y-0.5"><Dices size={22} strokeWidth={2.7} /></span>
            <span className="display-type hidden text-xl leading-none sm:block">Ego &amp; ID</span>
          </button>
          <button type="button" onClick={() => document.getElementById("how-to-play")?.scrollIntoView({ behavior: "smooth" })} className="rounded-full border-2 border-[#171113] bg-[#fffdf5]/80 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.12em] shadow-[2px_2px_0_#171113] transition-transform hover:-translate-y-0.5">How it works</button>
        </header>

        <section className="mx-auto grid max-w-6xl items-center gap-10 pb-16 pt-12 lg:grid-cols-[1.18fr_0.82fr] lg:pb-24 lg:pt-20">
          <div className="relative">
            <div className="eyebrow mb-5"><Sparkles size={13} fill="currentColor" /> A guessing game for glorious overthinkers</div>
            <h1 className="display-type max-w-3xl text-[clamp(3.4rem,10vw,7.4rem)] leading-[0.82]">WHO’S <span className="relative inline-block text-[#6c4ee2]">THE ID?</span></h1>
            <p className="mt-7 max-w-xl text-lg font-medium leading-8 text-[#3d2d31] sm:text-xl">One secret prompt. One revealing ranking. Can you decode the Judge’s order before the answer drops?</p>
            <div className="mt-8 flex flex-wrap gap-3 text-sm font-bold">
              <span className="rounded-full border-2 border-[#171113] bg-[#a8e7c1] px-4 py-2 shadow-[2px_2px_0_#171113]">3–11 players</span>
              <span className="rounded-full border-2 border-[#171113] bg-[#c8b6ff] px-4 py-2 shadow-[2px_2px_0_#171113]">Selfie-ready</span>
              <span className="rounded-full border-2 border-[#171113] bg-[#fff06e] px-4 py-2 shadow-[2px_2px_0_#171113]">Live &amp; chaotic</span>
            </div>
          </div>

          <section className="game-card mx-auto w-full max-w-md p-5 sm:p-7" aria-labelledby="room-entry-title">
            <div className="absolute -right-5 -top-4 h-12 w-12 rotate-12 rounded-full border-2 border-[#171113] bg-[#a8e7c1]" />
            <div className="relative">
              <p className="eyebrow">Make your move</p>
              <h2 id="room-entry-title" className="display-type mt-4 text-3xl leading-none">Get in the room</h2>
              <p className="mt-3 text-sm font-medium leading-6 text-[#5e464d]">Create a fresh room or jump into a friend’s six-character code.</p>

              <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl border-2 border-[#171113] bg-[#ffefb7] p-1.5">
                <button type="button" onClick={() => setEntryMode("create")} className={`rounded-xl px-3 py-2 text-sm font-extrabold transition ${entryMode === "create" ? "bg-[#171113] text-white shadow-[2px_2px_0_#c8b6ff]" : "text-[#171113]"}`}>Create room</button>
                <button type="button" onClick={() => setEntryMode("join")} className={`rounded-xl px-3 py-2 text-sm font-extrabold transition ${entryMode === "join" ? "bg-[#171113] text-white shadow-[2px_2px_0_#c8b6ff]" : "text-[#171113]"}`}>Join room</button>
              </div>

              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                <div>
                  <p className="text-sm font-extrabold">Your game face <span className="font-semibold text-[#70575e]">(optional)</span></p>
                  {cameraOpen ? (
                    <div className="mt-2 rounded-2xl border-2 border-[#171113] bg-[#171113] p-2 shadow-[3px_3px_0_#c8b6ff]">
                      <video ref={videoRef} autoPlay playsInline muted className="aspect-square w-full rounded-xl object-cover [transform:scaleX(-1)]" aria-label="Live selfie camera preview" />
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button type="button" onClick={stopCamera} className="rounded-xl border-2 border-white/60 px-3 py-2 text-sm font-black text-white"><X className="mr-1 inline" size={16} /> Cancel</button>
                        <button type="button" onClick={captureSelfie} className="rounded-xl border-2 border-[#171113] bg-[#fff06e] px-3 py-2 text-sm font-black text-[#171113]"><Camera className="mr-1 inline" size={16} /> Capture</button>
                      </div>
                    </div>
                  ) : avatarDataUrl ? (
                    <div className="mt-2 flex items-center gap-4 rounded-2xl border-2 border-[#171113] bg-[#a8e7c1] p-3">
                      <img src={avatarDataUrl} alt="Your captured selfie" className="size-20 rounded-full border-2 border-[#171113] object-cover" />
                      <div className="min-w-0 flex-1"><p className="flex items-center gap-1 text-sm font-black"><Check size={16} /> Selfie ready</p><button type="button" onClick={() => void startCamera()} className="mt-2 text-xs font-black underline underline-offset-4"><RotateCcw className="mr-1 inline" size={14} /> Retake</button></div>
                      <button type="button" onClick={() => setAvatarDataUrl(undefined)} aria-label="Remove selfie" className="grid size-9 place-items-center rounded-full border-2 border-[#171113] bg-[#fffdf5]"><X size={16} /></button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => void startCamera()} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#171113] bg-[#fffdf5]/75 px-4 py-3 text-sm font-black"><Camera size={18} /> Take a selfie</button>
                  )}
                  {cameraError && <p className="mt-2 text-xs font-bold leading-5 text-[#9b2f2f]" role="alert">{cameraError}</p>}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-extrabold" htmlFor="display-name">Your display name</label>
                  <input id="display-name" className="game-input" maxLength={24} value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="e.g. Cosmic Alex" autoComplete="nickname" required />
                </div>

                {entryMode === "join" && (
                  <div>
                    <label className="mb-2 block text-sm font-extrabold" htmlFor="room-code">Room code</label>
                    <input id="room-code" className="game-input uppercase tracking-[0.2em]" maxLength={6} value={roomCode} onChange={event => setRoomCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="ABC123" autoCapitalize="characters" autoComplete="off" required />
                  </div>
                )}

                <button type="submit" className="game-button flex w-full items-center justify-center gap-2" disabled={isSubmitting}>
                  {entryMode === "create" ? <Dices size={18} /> : <LogIn size={18} />}
                  {isSubmitting ? "Connecting…" : entryMode === "create" ? "Create a game room" : "Join the game"}
                  {!isSubmitting && <ArrowRight size={18} />}
                </button>
              </form>
            </div>
          </section>
        </section>

        <section id="how-to-play" className="mx-auto max-w-6xl pb-16" aria-labelledby="how-to-play-title">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div><p className="eyebrow">The mini rulebook</p><h2 id="how-to-play-title" className="display-type mt-3 text-4xl">Read the room. Read the IDs.</h2></div>
            <p className="max-w-sm text-sm font-medium leading-6 text-[#5e464d]">Every screen is built for the person holding a phone, not a laptop across the room.</p>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            <article className="game-card game-card--soft p-5"><div className="flex items-start gap-4"><span className="rule-number">01</span><div><Crown className="mb-3" size={24} strokeWidth={2.4} /><h3 className="text-lg font-black">Pick the secret</h3><p className="mt-2 text-sm leading-6 text-[#5e464d]">The Judge privately chooses one prompt from exactly ten options.</p></div></div></article>
            <article className="game-card game-card--soft bg-[#e5dcff]/90 p-5"><div className="flex items-start gap-4"><span className="rule-number bg-[#a8e7c1]">02</span><div><Users className="mb-3" size={24} strokeWidth={2.4} /><h3 className="text-lg font-black">Rank the IDs</h3><p className="mt-2 text-sm leading-6 text-[#5e464d]">The Judge drags the player IDs from best to worst fit for that secret prompt.</p></div></div></article>
            <article className="game-card game-card--soft bg-[#fff2a7]/90 p-5"><div className="flex items-start gap-4"><span className="rule-number bg-[#c8b6ff]">03</span><div><Sparkles className="mb-3" size={24} strokeWidth={2.4} /><h3 className="text-lg font-black">Reveal &amp; guess</h3><p className="mt-2 text-sm leading-6 text-[#5e464d]">Everyone sees the ranking beside all ten prompts, chooses one, and locks it in.</p></div></div></article>
          </div>
        </section>
      </div>
    </main>
  );
}

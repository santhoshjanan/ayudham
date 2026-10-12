# Review ledger: sound (`feat/poker-sound`)

Octopus code review, 2026-10-13. No Critical findings; nothing unsafe in the security or privacy path.

## Fixed

- Important: notes asked for before the page was touched queued on a suspended audio device and all played at the first click. Nothing is asked for until the page has been touched. Test: "in a newly opened tab nothing sounds, and nothing is queued".
- Important: music kept playing for someone removed from the room. Test: "music stops at once for someone removed from the room".
- Minor: the audio device stayed open after sound was turned off; a stopped track kept downloading; a double tick when sound was turned on during the count; the volume slider was announced as a fraction; an unlisted file in the audio folder would have been served without a licence row; the privacy page did not say that a music file is requested when sound is on.

## Rulings

- The music fades over the last two seconds of the countdown, so it is silent at zero and the beep is heard clean. The spec first said the fade starts at zero. Cost if wrong: one constant and one branch in the room's music effect.
- The files are the source's own MP3s, unchanged (about 19 MB in the repository), not re-encoded to about 9 MB as first proposed: no encoder was installed, and unchanged files can be checked against the source's checksums. Cost if wrong: a re-encode and four new checksum rows.
- While reconnecting, music carries on to the local end of the countdown. Cost if wrong: music for a few seconds after a timer the person could not see being stopped.

## Deferred

- Minor: in a background tab the fade is driven by a throttled clock, so the beep can land on music that has not yet faded. Fix: schedule the fade on the audio clock when the music starts.
- Minor, for the release plan: files under `/audio/` are served by the static handler, outside the app's hooks, so they carry no `Cross-Origin-Resource-Policy`, `nosniff` or `Cache-Control`, and no rate limit. Set these at Traefik or in `server.js`.
- Tests not written: the fade's shape and order against the beep, reveal-early fade, looping, volume persistence, a failed audio request leaving the countdown unaffected, music stopping on navigation to settings or history.
- Not verified on real devices: autoplay rules on iOS Safari, and how the bundled recordings sound on phone speakers.

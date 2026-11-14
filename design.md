# Caption Lens — Design Decisions

- Caption Lens is a user-activated YouTube overlay. It reads only the currently visible English caption and keeps no caption history.
- The compact card contains filtered useful words plus settings and close controls; it intentionally does not duplicate the full subtitle text.
- Dictionary data loads only on hover or click. Results persist in a global count-bounded cache (1,000 by default), with no expiry timer.
- Hover gives a short definition. Click gives detailed definitions grouped by part of speech; each group begins with three definitions and uses a minimal **More** control for further results.
- Hovering the card body pauses video playback, except over the settings/close controls. Caption Lens resumes playback only if it was the component that paused it.
- The card starts centered at 30% of viewport width and sits above the subtitle area. It can be moved and symmetrically resized from every edge or corner; its layout lasts for the current browser session.
- The Settings tab uses a live preview, responsive auto-fitting setting groups, explicit Save, and Set to default controls. Card and definition popup colors, opacity, typography, and outlines are configured independently.
- Default styling is intentionally light: card and word-button backgrounds use 25% opacity with no card outline; the definition popup uses a grey 25% background.

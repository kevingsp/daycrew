# Daycrew brand assets

[Fused Relay](daycrew/daycrew.svg) is the Daycrew mark. The Dev variant adds a [goldenrod horizon](daycrew/dev-horizon.svg) beneath the relay. Use the full-color mark for product identity and the [single-color silhouette](daycrew/relay-monochrome.svg) for surfaces that apply their own tint, including Android themed icons and notifications.

| Color     | Value     | Use                             |
| --------- | --------- | ------------------------------- |
| Midnight  | `#050619` | Dark backdrops                  |
| Violet    | `#28204e` | Night sky and dark elevations   |
| Ruby      | `#ff173f` | Relay and dawn accents          |
| Orange    | `#fa6203` | Relay and dusk accents          |
| Goldenrod | `#f5a918` | Dev horizon and daytime accents |
| Cream     | `#fff8ef` | Light backdrops                 |

The workspace sky uses softened versions of these colors. Light appearance favors cream and gold by day. Dark appearance deepens the same cycle toward midnight. Foreground and focus colors adapt to the rendered background.

Run `vp run icons:export` to regenerate the web, desktop, and mobile assets from the SVGs. Run `vp run icons:check` to verify the tracked exports. The exporter keeps a transparent safe area on macOS and separate foreground and background layers for Android launcher masks.

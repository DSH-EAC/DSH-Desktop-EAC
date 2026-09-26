/**
 * GENERATED FILE — do not edit by hand.
 *
 * Regenerate with: npm run build:snapshot
 *
 * Offline catalog snapshot embedded in the plugin bundle. Sources:
 *   dsh-mojobox/catalog/plugins/*.json
 *   dsh-mojobox/catalog/packs/*.{pack,lock}.json
 *   DSH-Desktop-EAC/.sync/plugin-distribution.json
 *   DSH-Desktop-EAC/.sync/plugins.json
 *
 * 47 plugin records, 6 packs (one derived skin view).
 * Every member carries a real artifact URL/digest from the sources above; no
 * digest is fabricated. The derived skin pack names its provenance.
 *
 * @module data/snapshot
 */

/** Build timestamp of this snapshot. */
export const SNAPSHOT_GENERATED_AT = "2026-09-26T17:27:18.420Z"

/** Mojobox repository revision this snapshot was read from, when known. */
export const SNAPSHOT_SOURCES = {
  "mojobox": "dsh-mojobox",
  "desktop": "DSH-Desktop-EAC",
  "pluginRecords": 47,
  "packs": 6
} as const

/** The catalog document, parsed and validated by `core/catalog.ts` at load time. */
export const snapshotDocument: unknown = {
  "apiVersion": "catalog.mojobox.dev/v1alpha1",
  "plugins": [
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.aio.dsh-drag-and-drop",
      "name": "dsh-drag-and-drop",
      "version": "0.1.6",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "BSD-3-Clause",
      "source": {
        "repository": "https://github.com/omdsh-dev/dsh-drag-and-drop",
        "revision": "0.1.6"
      },
      "artifact": {
        "digest": "sha256:d50d050373555a73d43bd0ff400028b4012b7375ec5b1134f76adaa48859b8f0",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/dsh-drag-and-drop/-/dsh-drag-and-drop-0.1.6.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh-plugin.json"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.aio.dsh-find-plugin",
      "name": "dsh-find-plugin",
      "version": "0.3.7",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/awesome-dsh-plugin/dsh-find-plugin",
        "revision": "0.3.7"
      },
      "artifact": {
        "digest": "sha256:46c408fc9f649b90ec25b30fa02dcc0f1e783c4a269e82468b7095ce1cffa992",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/dsh-find-plugin/-/dsh-find-plugin-0.3.7.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh-plugin.json"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.aio.dsh-meme",
      "name": "dsh-meme",
      "version": "0.1.40",
      "facets": {
        "host": {
          "entry": "index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/yyh-001/dsh-meme",
        "revision": "0.1.40"
      },
      "artifact": {
        "digest": "sha256:aa472d113bd269f9807863fdea033293b158f3b2bb72cd07797eb55ed9d9bb55",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/dsh-meme/-/dsh-meme-0.1.40.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh-plugin.json"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.aio.dsh-navbar",
      "name": "@vlln/dsh-navbar",
      "version": "0.4.0",
      "facets": {
        "host": {
          "entry": "lib/index.mjs",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/vlln/dsh-navbar",
        "revision": "0.4.0"
      },
      "artifact": {
        "digest": "sha256:72886a2376c09e202a830029beb5503ce4710a9b208bacca8759c2d41a61c908",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/@vlln/dsh-navbar/-/dsh-navbar-0.4.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh.plugin.json"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.aio.dsh-smooth-stream",
      "name": "dsh-smooth-stream",
      "version": "0.4.3",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/Laplace-bit/dsh-smooth-stream",
        "revision": "0.4.3"
      },
      "artifact": {
        "digest": "sha256:8e1746b755d3d606d91641da9905e91647fe2a78a41d9a85f7a8b3a0b1a31038",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/dsh-smooth-stream/-/dsh-smooth-stream-0.4.3.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh-plugin.json"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.aio.dsh-status-rotator",
      "name": "dsh-status-rotator",
      "version": "0.9.1",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/01Virex/dsh-status-rotator",
        "revision": "0.9.1"
      },
      "artifact": {
        "digest": "sha256:632723d46aae2d34fda28e588f21c628993c6f34afb4b354319661e3b13165a7",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/dsh-status-rotator/-/dsh-status-rotator-0.9.1.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh-plugin.json"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.aio.dsh-wallpaper-engine",
      "name": "dsh-plugin-wallpaper-engine",
      "version": "0.6.8",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/elysia395/dsh-wallpaper-engine",
        "revision": "0.6.8"
      },
      "artifact": {
        "digest": "sha256:2ff76ed3b82937efe87ca829c7a4fca00b21ca521a208ffd501124f6b6f17006",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/dsh-plugin-wallpaper-engine/-/dsh-plugin-wallpaper-engine-0.6.8.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh-plugin.json"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.aio.dsh-whale-widget",
      "name": "dsh-whale-widget",
      "version": "0.2.10",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget",
        "revision": "0.2.10"
      },
      "artifact": {
        "digest": "sha256:c53074c8e792a7f42c8341a45063276fa194307fc3752a594848cc64aa833bc2",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/dsh-whale-widget/-/dsh-whale-widget-0.2.10.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh-plugin.json"
      },
      "x-mojobox-distribution": {
        "distributionClass": "external",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.dsh-client-file-changes",
      "name": "@deepseek-ai/dsh-client-file-changes",
      "version": "0.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/DSH-EAC/DSH-Desktop-EAC",
        "revision": "a9b90e254800dfe84c65c01d150a8596e94f6a31"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "artifactStatus": "unpublished",
        "sourcePath": "dsh-desktop/assets/plugins/dsh-client-file-changes"
      },
      "x-mojobox-distribution": {
        "distributionClass": "builtin",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.dsh-compact",
      "name": "dsh-compact",
      "version": "1.0.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/lanyun077/Deepseek-Harness-EAC",
        "revision": "94304f39405cbada937b26e60c3efe754387f7d3"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "artifactStatus": "unpublished",
        "sourcePath": "dsh-desktop/assets/plugins/dsh-compact"
      },
      "x-mojobox-distribution": {
        "distributionClass": "builtin",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.dsh-eac-core-bridge",
      "name": "dsh-eac-core-bridge",
      "version": "1.0.0",
      "facets": {
        "host": {
          "entry": "index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/DSH-EAC/DSH-Desktop-EAC",
        "revision": "a9b90e254800dfe84c65c01d150a8596e94f6a31"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "artifactStatus": "unpublished",
        "sourcePath": "dsh-desktop/assets/plugins/dsh-eac-core-bridge"
      },
      "x-mojobox-distribution": {
        "distributionClass": "builtin",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.dsh-eac-locale-compat",
      "name": "dsh-eac-locale-compat",
      "version": "1.0.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/DSH-EAC/DSH-Desktop-EAC",
        "revision": "a9b90e254800dfe84c65c01d150a8596e94f6a31"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "artifactStatus": "unpublished",
        "sourcePath": "dsh-desktop/assets/plugins/dsh-eac-locale-compat"
      },
      "x-mojobox-distribution": {
        "distributionClass": "builtin",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.dsh-easy-setup",
      "name": "@deepseek-ai/dsh-easy-setup",
      "version": "0.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/DSH-EAC/DSH-Desktop-EAC",
        "revision": "a9b90e254800dfe84c65c01d150a8596e94f6a31"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "artifactStatus": "unpublished",
        "sourcePath": "dsh-desktop/assets/plugins/dsh-easy-setup"
      },
      "x-mojobox-distribution": {
        "distributionClass": "builtin",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.dsh-file-changes",
      "name": "@deepseek-ai/dsh-file-changes",
      "version": "0.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/DSH-EAC/DSH-Desktop-EAC",
        "revision": "a9b90e254800dfe84c65c01d150a8596e94f6a31"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "artifactStatus": "unpublished",
        "sourcePath": "dsh-desktop/assets/plugins/dsh-file-changes"
      },
      "x-mojobox-distribution": {
        "distributionClass": "builtin",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.dsh-file-drop-eac",
      "name": "dsh-file-drop-eac",
      "version": "0.1.2",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/DSH-EAC/DSH-Desktop-EAC",
        "revision": "a9b90e254800dfe84c65c01d150a8596e94f6a31"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "artifactStatus": "unpublished",
        "sourcePath": "dsh-desktop/assets/plugins/dsh-file-drop-eac"
      },
      "x-mojobox-distribution": {
        "distributionClass": "builtin",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.dsh-message-rewind",
      "name": "dsh-message-rewind",
      "version": "0.1.0",
      "facets": {
        "host": {
          "entry": "lib/host.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/lanyun077/Deepseek-Harness-EAC",
        "revision": "94304f39405cbada937b26e60c3efe754387f7d3"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "artifactStatus": "unpublished",
        "sourcePath": "dsh-desktop/assets/plugins/dsh-message-rewind"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.dsh-plugin-manager",
      "name": "@deepseek-ai/dsh-plugin-manager",
      "version": "0.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/DSH-EAC/DSH-Desktop-EAC",
        "revision": "a9b90e254800dfe84c65c01d150a8596e94f6a31"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "artifactStatus": "unpublished",
        "sourcePath": "dsh-desktop/assets/plugins/dsh-plugin-manager"
      },
      "x-mojobox-distribution": {
        "distributionClass": "builtin",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.dsh-plugin-shield",
      "name": "dsh-plugin-shield",
      "version": "0.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/DSH-EAC/DSH-Desktop-EAC",
        "revision": "a9b90e254800dfe84c65c01d150a8596e94f6a31"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "artifactStatus": "unpublished",
        "sourcePath": "dsh-desktop/assets/plugins/dsh-plugin-shield"
      },
      "x-mojobox-distribution": {
        "distributionClass": "builtin",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.dsh-settings-scroll-fix",
      "name": "dsh-settings-scroll-fix",
      "version": "2.0.2",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/DSH-EAC/DSH-Desktop-EAC",
        "revision": "a9b90e254800dfe84c65c01d150a8596e94f6a31"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "artifactStatus": "unpublished",
        "sourcePath": "dsh-desktop/assets/plugins/dsh-settings-scroll-fix"
      },
      "x-mojobox-distribution": {
        "distributionClass": "builtin",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.dsh-terminal",
      "name": "@deepseek-ai/dsh-terminal",
      "version": "0.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/DSH-EAC/DSH-Desktop-EAC",
        "revision": "a9b90e254800dfe84c65c01d150a8596e94f6a31"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "artifactStatus": "unpublished",
        "sourcePath": "dsh-desktop/assets/plugins/dsh-terminal"
      },
      "x-mojobox-distribution": {
        "distributionClass": "builtin",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.dsh-unified-market",
      "name": "dsh-unified-market",
      "version": "0.4.0",
      "facets": {
        "host": {
          "entry": "lib/host.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/DSH-EAC/DSH-Desktop-EAC",
        "revision": "a9b90e254800dfe84c65c01d150a8596e94f6a31"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "artifactStatus": "unpublished",
        "sourcePath": "dsh-desktop/assets/plugins/dsh-unified-market",
        "reason": "EAC-modified bundle; the published npm dsh-unified-market@0.4.0 (jing-hy) does not reproduce it"
      },
      "x-mojobox-distribution": {
        "distributionClass": "builtin",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.dsh-viewport-lock",
      "name": "dsh-viewport-lock",
      "version": "1.0.1",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/DSH-EAC/DSH-Desktop-EAC",
        "revision": "a9b90e254800dfe84c65c01d150a8596e94f6a31"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "artifactStatus": "unpublished",
        "sourcePath": "dsh-desktop/assets/plugins/dsh-viewport-lock"
      },
      "x-mojobox-distribution": {
        "distributionClass": "builtin",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.skin-aurora",
      "name": "@dsh-eac/skin-aurora",
      "version": "1.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/DSH-EAC/dsh-ui-skin-loader",
        "revision": "e3ac8675c51da74c5084c7bf99fc78ce6ee129ac"
      },
      "artifact": {
        "digest": "sha256:3abf546ccbea8fa106290ed0a96c77661a9620e88fadb57b76afa12aa503cd35",
        "algorithm": "sha256",
        "path": "https://github.com/DSH-EAC/dsh-ui-skin-loader/releases/download/v1.1.0/dsh-eac-skin-aurora-1.1.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Reference skin authored in DSH-EAC/dsh-ui-skin-loader; no vendored third-party content. Artifact is the GitHub release tgz; digest measured from the locally verified v1.1.0 release bundle (14 tgz + SHA256SUMS.txt); GitHub Release v1.1.0 asset publication and npm publication both pending (Pack Lock source requires npm:)."
      },
      "x-mojobox-package": {
        "dsh": {
          "manifestVersion": 1,
          "bundle": {
            "patch": "./cordis.patch.yml"
          },
          "client": {
            "platform": "web",
            "inject": [],
            "external": [],
            "immediately": false
          }
        }
      },
      "x-mojobox-skin": {
        "apiVersion": "dsh.ecosystem.ui-skin-loader/v1",
        "id": "dsh-eac.skin.aurora",
        "name": "极光之夜",
        "author": "DSH-EAC"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "installer-policy"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.skin-blue-fantasy",
      "name": "@dsh-eac/skin-blue-fantasy",
      "version": "1.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT AND BSD-3-Clause",
      "source": {
        "repository": "https://github.com/DSH-EAC/dsh-ui-skin-loader",
        "revision": "e3ac8675c51da74c5084c7bf99fc78ce6ee129ac"
      },
      "artifact": {
        "digest": "sha256:b89297f957c93ce76cc9984ebfdf73d49889c89d568200ac4e06a8b90dc94a44",
        "algorithm": "sha256",
        "path": "https://github.com/DSH-EAC/dsh-ui-skin-loader/releases/download/v1.1.0/dsh-eac-skin-blue-fantasy-1.1.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Appearance content is BSD-3-Clause (c) zhu1090093659 via dsh-web-ui (@linxin666/dsh-client-ui-skin-blue-fantasy 0.1.11) with DreamSkin artwork MIT (c) powerdog996, migrated from DSH-Desktop-EAC@26841f5ee83c154a9768cc0a9cec1d70078f0ddf and recorded with full source/license text in the package THIRD-PARTY-NOTICES.md. Artifact is the GitHub release tgz; digest measured from the locally verified v1.1.0 release bundle (14 tgz + SHA256SUMS.txt); GitHub Release v1.1.0 asset publication and npm publication both pending (Pack Lock source requires npm:)."
      },
      "x-mojobox-package": {
        "dsh": {
          "manifestVersion": 1,
          "bundle": {
            "patch": "./cordis.patch.yml"
          },
          "client": {
            "platform": "web",
            "inject": [],
            "external": [],
            "immediately": false
          }
        }
      },
      "x-mojobox-skin": {
        "apiVersion": "dsh.ecosystem.ui-skin-loader/v1",
        "id": "dsh-eac.skin.blue-fantasy",
        "name": "蓝色幻想",
        "author": "powerdog996 (DreamSkin) · zhu1090093659 (dsh-web-ui) · DSH-EAC"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "installer-policy"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.skin-deep-whale-day-night",
      "name": "@dsh-eac/skin-deep-whale-day-night",
      "version": "1.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "CC-BY-NC-SA-4.0",
      "source": {
        "repository": "https://github.com/DSH-EAC/dsh-ui-skin-loader",
        "revision": "e3ac8675c51da74c5084c7bf99fc78ce6ee129ac"
      },
      "artifact": {
        "digest": "sha256:8d1f42ed937e1ac84e1726e0cae5b2fc20fc2735671d2268e4f9f31c13aec7d6",
        "algorithm": "sha256",
        "path": "https://github.com/DSH-EAC/dsh-ui-skin-loader/releases/download/v1.1.0/dsh-eac-skin-deep-whale-day-night-1.1.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Appearance content is CC BY-NC-SA 4.0 (non-commercial; attribution chain 上善 → zipzip → Small-tailqwq), migrated from GGBond2424648901/deep-whale-day-night-theme@3f6c4f14716d1e500f585be0c0d3c139c7a8a90b. The loader's v1.1.0 release manifest defers the package (R3: residual maid-atelier body-marker strings collide with @dsh-eac/skin-maid-atelier) while the final verified bundle still carries its 1.1.0 tgz. Artifact is the GitHub release tgz; digest measured from the locally verified v1.1.0 release bundle (14 tgz + SHA256SUMS.txt); GitHub Release v1.1.0 asset publication and npm publication both pending (Pack Lock source requires npm:)."
      },
      "x-mojobox-package": {
        "dsh": {
          "manifestVersion": 1,
          "bundle": {
            "patch": "./cordis.patch.yml"
          },
          "client": {
            "platform": "web",
            "inject": [
              "uiSkinLoader",
              "theme"
            ],
            "external": [],
            "immediately": false
          }
        }
      },
      "x-mojobox-skin": {
        "apiVersion": "dsh.ecosystem.ui-skin-loader/v1",
        "id": "dsh-eac.skin.deep-whale-day-night",
        "name": "鲸鱼娘昼夜工坊",
        "author": "Small-tailqwq · 上善 · zipzip · DSH-EAC"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "installer-policy"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.skin-dragon-heir",
      "name": "@dsh-eac/skin-dragon-heir",
      "version": "1.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT AND BSD-3-Clause",
      "source": {
        "repository": "https://github.com/DSH-EAC/dsh-ui-skin-loader",
        "revision": "e3ac8675c51da74c5084c7bf99fc78ce6ee129ac"
      },
      "artifact": {
        "digest": "sha256:c315837b67597107612a0c663ec8e8168e6f90622017bb6735614b4a3a322ba3",
        "algorithm": "sha256",
        "path": "https://github.com/DSH-EAC/dsh-ui-skin-loader/releases/download/v1.1.0/dsh-eac-skin-dragon-heir-1.1.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Appearance content is BSD-3-Clause (c) zhu1090093659 via dsh-web-ui (@linxin666/dsh-client-ui-skin-dragon-heir 0.1.11), migrated from DSH-Desktop-EAC@26841f5ee83c154a9768cc0a9cec1d70078f0ddf and recorded with full source/license text in the package THIRD-PARTY-NOTICES.md. Artifact is the GitHub release tgz; digest measured from the locally verified v1.1.0 release bundle (14 tgz + SHA256SUMS.txt); GitHub Release v1.1.0 asset publication and npm publication both pending (Pack Lock source requires npm:)."
      },
      "x-mojobox-package": {
        "dsh": {
          "manifestVersion": 1,
          "bundle": {
            "patch": "./cordis.patch.yml"
          },
          "client": {
            "platform": "web",
            "inject": [],
            "external": [],
            "immediately": false
          }
        }
      },
      "x-mojobox-skin": {
        "apiVersion": "dsh.ecosystem.ui-skin-loader/v1",
        "id": "dsh-eac.skin.dragon-heir",
        "name": "龙的传人",
        "author": "zhu1090093659 (dsh-web-ui) · DSH-EAC (covenant conversion)"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "installer-policy"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.skin-inkwash",
      "name": "@dsh-eac/skin-inkwash",
      "version": "1.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/DSH-EAC/dsh-ui-skin-loader",
        "revision": "e3ac8675c51da74c5084c7bf99fc78ce6ee129ac"
      },
      "artifact": {
        "digest": "sha256:775754b4354043965b19888aaee238854e7fd4d4cc9096b7bbc0826e8e2adcf3",
        "algorithm": "sha256",
        "path": "https://github.com/DSH-EAC/dsh-ui-skin-loader/releases/download/v1.1.0/dsh-eac-skin-inkwash-1.1.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Reference skin authored in DSH-EAC/dsh-ui-skin-loader; no vendored third-party content. Artifact is the GitHub release tgz; digest measured from the locally verified v1.1.0 release bundle (14 tgz + SHA256SUMS.txt); GitHub Release v1.1.0 asset publication and npm publication both pending (Pack Lock source requires npm:)."
      },
      "x-mojobox-package": {
        "dsh": {
          "manifestVersion": 1,
          "bundle": {
            "patch": "./cordis.patch.yml"
          },
          "client": {
            "platform": "web",
            "inject": [],
            "external": [],
            "immediately": false
          }
        }
      },
      "x-mojobox-skin": {
        "apiVersion": "dsh.ecosystem.ui-skin-loader/v1",
        "id": "dsh-eac.skin.inkwash",
        "name": "水墨青烟",
        "author": "DSH-EAC"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "installer-policy"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.skin-maid-atelier",
      "name": "@dsh-eac/skin-maid-atelier",
      "version": "1.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT AND CC-BY-NC-SA-4.0",
      "source": {
        "repository": "https://github.com/DSH-EAC/dsh-ui-skin-loader",
        "revision": "e3ac8675c51da74c5084c7bf99fc78ce6ee129ac"
      },
      "artifact": {
        "digest": "sha256:e1cc9c348d6f3d2ab34f7d31ca5cb89f3c9820d92086b136d2b64137a8376971",
        "algorithm": "sha256",
        "path": "https://github.com/DSH-EAC/dsh-ui-skin-loader/releases/download/v1.1.0/dsh-eac-skin-maid-atelier-1.1.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Appearance content is CC BY-NC-SA 4.0 (non-commercial, attribution chain 上善 → zipzip → Small-tailqwq; upstream @dsh-external/dsh-client-ui-skin-maid-atelier 0.0.1), migrated from DSH-Desktop-EAC@26841f5ee83c154a9768cc0a9cec1d70078f0ddf and recorded with full source/license text in the package THIRD-PARTY-NOTICES.md. Artifact is the GitHub release tgz; digest measured from the locally verified v1.1.0 release bundle (14 tgz + SHA256SUMS.txt); GitHub Release v1.1.0 asset publication and npm publication both pending (Pack Lock source requires npm:)."
      },
      "x-mojobox-package": {
        "dsh": {
          "manifestVersion": 1,
          "bundle": {
            "patch": "./cordis.patch.yml"
          },
          "client": {
            "platform": "web",
            "inject": [],
            "external": [],
            "immediately": false
          }
        }
      },
      "x-mojobox-skin": {
        "apiVersion": "dsh.ecosystem.ui-skin-loader/v1",
        "id": "dsh-eac.skin.maid-atelier",
        "name": "深海女仆工坊",
        "author": "Small-tailqwq · 上善 · zipzip · DSH-EAC"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "installer-policy"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.skin-miku",
      "name": "@dsh-eac/skin-miku",
      "version": "1.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT AND BSD-3-Clause",
      "source": {
        "repository": "https://github.com/DSH-EAC/dsh-ui-skin-loader",
        "revision": "e3ac8675c51da74c5084c7bf99fc78ce6ee129ac"
      },
      "artifact": {
        "digest": "sha256:699c4ebbaefbb29b6012ea14ccdd6357934a2f5e582f157dacc1ee783601143f",
        "algorithm": "sha256",
        "path": "https://github.com/DSH-EAC/dsh-ui-skin-loader/releases/download/v1.1.0/dsh-eac-skin-miku-1.1.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Appearance content is BSD-3-Clause (c) zhu1090093659 via dsh-web-ui (@linxin666/dsh-client-ui-skin-miku 0.1.11), migrated from DSH-Desktop-EAC@26841f5ee83c154a9768cc0a9cec1d70078f0ddf and recorded with full source/license text in the package THIRD-PARTY-NOTICES.md. Artifact is the GitHub release tgz; digest measured from the locally verified v1.1.0 release bundle (14 tgz + SHA256SUMS.txt); GitHub Release v1.1.0 asset publication and npm publication both pending (Pack Lock source requires npm:)."
      },
      "x-mojobox-package": {
        "dsh": {
          "manifestVersion": 1,
          "bundle": {
            "patch": "./cordis.patch.yml"
          },
          "client": {
            "platform": "web",
            "inject": [],
            "external": [],
            "immediately": false
          }
        }
      },
      "x-mojobox-skin": {
        "apiVersion": "dsh.ecosystem.ui-skin-loader/v1",
        "id": "dsh-eac.skin.miku",
        "name": "初音未来 · 电子歌姬",
        "author": "涂山苏苏 · zhu1090093659 (dsh-web-ui) · DSH-EAC"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "installer-policy"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.skin-minecraft",
      "name": "@dsh-eac/skin-minecraft",
      "version": "1.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT AND BSD-3-Clause",
      "source": {
        "repository": "https://github.com/DSH-EAC/dsh-ui-skin-loader",
        "revision": "e3ac8675c51da74c5084c7bf99fc78ce6ee129ac"
      },
      "artifact": {
        "digest": "sha256:a163eae0e8772ffd955b84e863e1a31eaa338ad531d6feaaf683725d04a1230f",
        "algorithm": "sha256",
        "path": "https://github.com/DSH-EAC/dsh-ui-skin-loader/releases/download/v1.1.0/dsh-eac-skin-minecraft-1.1.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Appearance content is BSD-3-Clause (c) zhu1090093659 via dsh-web-ui (@linxin666/dsh-client-ui-skin-minecraft 0.1.11), migrated from DSH-Desktop-EAC@26841f5ee83c154a9768cc0a9cec1d70078f0ddf and recorded with full source/license text in the package THIRD-PARTY-NOTICES.md. Artifact is the GitHub release tgz; digest measured from the locally verified v1.1.0 release bundle (14 tgz + SHA256SUMS.txt); GitHub Release v1.1.0 asset publication and npm publication both pending (Pack Lock source requires npm:)."
      },
      "x-mojobox-package": {
        "dsh": {
          "manifestVersion": 1,
          "bundle": {
            "patch": "./cordis.patch.yml"
          },
          "client": {
            "platform": "web",
            "inject": [],
            "external": [],
            "immediately": false
          }
        }
      },
      "x-mojobox-skin": {
        "apiVersion": "dsh.ecosystem.ui-skin-loader/v1",
        "id": "dsh-eac.skin.minecraft",
        "name": "Minecraft 方块世界",
        "author": "zhu1090093659 (dsh-web-ui) · DSH-EAC"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "installer-policy"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.skin-qq98",
      "name": "@dsh-eac/skin-qq98",
      "version": "1.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT AND BSD-3-Clause",
      "source": {
        "repository": "https://github.com/DSH-EAC/dsh-ui-skin-loader",
        "revision": "e3ac8675c51da74c5084c7bf99fc78ce6ee129ac"
      },
      "artifact": {
        "digest": "sha256:ac135b64eca54d4d4f571129abdad72f763536d7facaa6bbe0bedb1c35ae8235",
        "algorithm": "sha256",
        "path": "https://github.com/DSH-EAC/dsh-ui-skin-loader/releases/download/v1.1.0/dsh-eac-skin-qq98-1.1.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Appearance content is BSD-3-Clause (c) zhu1090093659 via dsh-web-ui (@linxin666/dsh-client-ui-skin-qq98 0.1.11), migrated from DSH-Desktop-EAC@26841f5ee83c154a9768cc0a9cec1d70078f0ddf and recorded with full source/license text in the package THIRD-PARTY-NOTICES.md. Artifact is the GitHub release tgz; digest measured from the locally verified v1.1.0 release bundle (14 tgz + SHA256SUMS.txt); GitHub Release v1.1.0 asset publication and npm publication both pending (Pack Lock source requires npm:)."
      },
      "x-mojobox-package": {
        "dsh": {
          "manifestVersion": 1,
          "bundle": {
            "patch": "./cordis.patch.yml"
          },
          "client": {
            "platform": "web",
            "inject": [],
            "external": [],
            "immediately": false
          }
        }
      },
      "x-mojobox-skin": {
        "apiVersion": "dsh.ecosystem.ui-skin-loader/v1",
        "id": "dsh-eac.skin.qq98",
        "name": "QQ2008 怀旧版",
        "author": "zhu1090093659 (dsh-web-ui) · DSH-EAC"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "installer-policy"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.skin-ths",
      "name": "@dsh-eac/skin-ths",
      "version": "1.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT AND BSD-3-Clause",
      "source": {
        "repository": "https://github.com/DSH-EAC/dsh-ui-skin-loader",
        "revision": "e3ac8675c51da74c5084c7bf99fc78ce6ee129ac"
      },
      "artifact": {
        "digest": "sha256:885d55967b35f4273c35da27bf5722e85e2dbe68656aaa2721d8cd55239f8512",
        "algorithm": "sha256",
        "path": "https://github.com/DSH-EAC/dsh-ui-skin-loader/releases/download/v1.1.0/dsh-eac-skin-ths-1.1.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Appearance content is BSD-3-Clause (c) zhu1090093659 via dsh-web-ui (@linxin666/dsh-client-ui-skin-ths 0.1.11), migrated from DSH-Desktop-EAC@26841f5ee83c154a9768cc0a9cec1d70078f0ddf and recorded with full source/license text in the package THIRD-PARTY-NOTICES.md. Artifact is the GitHub release tgz; digest measured from the locally verified v1.1.0 release bundle (14 tgz + SHA256SUMS.txt); GitHub Release v1.1.0 asset publication and npm publication both pending (Pack Lock source requires npm:)."
      },
      "x-mojobox-package": {
        "dsh": {
          "manifestVersion": 1,
          "bundle": {
            "patch": "./cordis.patch.yml"
          },
          "client": {
            "platform": "web",
            "inject": [],
            "external": [],
            "immediately": false
          }
        }
      },
      "x-mojobox-skin": {
        "apiVersion": "dsh.ecosystem.ui-skin-loader/v1",
        "id": "dsh-eac.skin.ths",
        "name": "同花顺风格",
        "author": "zhu1090093659 (dsh-web-ui) · DSH-EAC"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "installer-policy"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.skin-trading",
      "name": "@dsh-eac/skin-trading",
      "version": "1.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT AND BSD-3-Clause",
      "source": {
        "repository": "https://github.com/DSH-EAC/dsh-ui-skin-loader",
        "revision": "e3ac8675c51da74c5084c7bf99fc78ce6ee129ac"
      },
      "artifact": {
        "digest": "sha256:f77b0a06dccf595d02208e290875381a97705cea434eb05936aab6fe0120fb0e",
        "algorithm": "sha256",
        "path": "https://github.com/DSH-EAC/dsh-ui-skin-loader/releases/download/v1.1.0/dsh-eac-skin-trading-1.1.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Appearance content is BSD-3-Clause (c) zhu1090093659 via dsh-web-ui (@linxin666/dsh-client-ui-skin-trading 0.1.11), migrated from DSH-Desktop-EAC@26841f5ee83c154a9768cc0a9cec1d70078f0ddf and recorded with full source/license text in the package THIRD-PARTY-NOTICES.md. Artifact is the GitHub release tgz; digest measured from the locally verified v1.1.0 release bundle (14 tgz + SHA256SUMS.txt); GitHub Release v1.1.0 asset publication and npm publication both pending (Pack Lock source requires npm:)."
      },
      "x-mojobox-package": {
        "dsh": {
          "manifestVersion": 1,
          "bundle": {
            "patch": "./cordis.patch.yml"
          },
          "client": {
            "platform": "web",
            "inject": [],
            "external": [],
            "immediately": false
          }
        }
      },
      "x-mojobox-skin": {
        "apiVersion": "dsh.ecosystem.ui-skin-loader/v1",
        "id": "dsh-eac.skin.trading",
        "name": "交易终端",
        "author": "zhu1090093659 (dsh-web-ui) · DSH-EAC (covenant conversion)"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "installer-policy"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.skin-whale-song",
      "name": "@dsh-eac/skin-whale-song",
      "version": "1.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT AND BSD-3-Clause",
      "source": {
        "repository": "https://github.com/DSH-EAC/dsh-ui-skin-loader",
        "revision": "e3ac8675c51da74c5084c7bf99fc78ce6ee129ac"
      },
      "artifact": {
        "digest": "sha256:7becbd60588e67b0974e7524c3adbbdc3f986b4b2c6ccef0c54bf0741a70f5ce",
        "algorithm": "sha256",
        "path": "https://github.com/DSH-EAC/dsh-ui-skin-loader/releases/download/v1.1.0/dsh-eac-skin-whale-song-1.1.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Appearance content is BSD-3-Clause (c) zhu1090093659 via dsh-web-ui (@linxin666/dsh-client-ui-skin-whale-song 0.1.11; upstream figurative artwork removed per IP ruling R13), migrated from DSH-Desktop-EAC@26841f5ee83c154a9768cc0a9cec1d70078f0ddf and recorded with full source/license text in the package THIRD-PARTY-NOTICES.md. Artifact is the GitHub release tgz; digest measured from the locally verified v1.1.0 release bundle (14 tgz + SHA256SUMS.txt); GitHub Release v1.1.0 asset publication and npm publication both pending (Pack Lock source requires npm:)."
      },
      "x-mojobox-package": {
        "dsh": {
          "manifestVersion": 1,
          "bundle": {
            "patch": "./cordis.patch.yml"
          },
          "client": {
            "platform": "web",
            "inject": [],
            "external": [],
            "immediately": false
          }
        }
      },
      "x-mojobox-skin": {
        "apiVersion": "dsh.ecosystem.ui-skin-loader/v1",
        "id": "dsh-eac.skin.whale-song",
        "name": "鲸吟",
        "author": "zhu1090093659 (dsh-web-ui) · DSH-EAC (covenant conversion)"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "installer-policy"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.skin-xp",
      "name": "@dsh-eac/skin-xp",
      "version": "1.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT AND BSD-3-Clause",
      "source": {
        "repository": "https://github.com/DSH-EAC/dsh-ui-skin-loader",
        "revision": "e3ac8675c51da74c5084c7bf99fc78ce6ee129ac"
      },
      "artifact": {
        "digest": "sha256:7ba298308484104719bbbf4257a39d32ed616a775cf6dd70e17d7afc9e803b0c",
        "algorithm": "sha256",
        "path": "https://github.com/DSH-EAC/dsh-ui-skin-loader/releases/download/v1.1.0/dsh-eac-skin-xp-1.1.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Appearance content is BSD-3-Clause (c) zhu1090093659 via dsh-web-ui (@linxin666/dsh-client-ui-skin-xp 0.1.11), migrated from DSH-Desktop-EAC@26841f5ee83c154a9768cc0a9cec1d70078f0ddf and recorded with full source/license text in the package THIRD-PARTY-NOTICES.md. Artifact is the GitHub release tgz; digest measured from the locally verified v1.1.0 release bundle (14 tgz + SHA256SUMS.txt); GitHub Release v1.1.0 asset publication and npm publication both pending (Pack Lock source requires npm:)."
      },
      "x-mojobox-package": {
        "dsh": {
          "manifestVersion": 1,
          "bundle": {
            "patch": "./cordis.patch.yml"
          },
          "client": {
            "platform": "web",
            "inject": [],
            "external": [],
            "immediately": false
          }
        }
      },
      "x-mojobox-skin": {
        "apiVersion": "dsh.ecosystem.ui-skin-loader/v1",
        "id": "dsh-eac.skin.xp",
        "name": "Windows XP (Luna)",
        "author": "zhu1090093659 (dsh-web-ui) · DSH-EAC"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "installer-policy"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.ui-skin-loader",
      "name": "@dsh-eac/ui-skin-loader",
      "version": "1.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/DSH-EAC/dsh-ui-skin-loader",
        "revision": "e3ac8675c51da74c5084c7bf99fc78ce6ee129ac"
      },
      "artifact": {
        "digest": "sha256:b926aad7d312c9573226414867049a48b6825e2bb15d8ba76a3d707095ef1ba6",
        "algorithm": "sha256",
        "path": "https://github.com/DSH-EAC/dsh-ui-skin-loader/releases/download/v1.1.0/dsh-eac-ui-skin-loader-1.1.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Maintained in DSH-EAC/dsh-ui-skin-loader (loader release v1.1.0). Artifact is the GitHub release tgz; digest measured from the locally verified v1.1.0 release bundle (14 tgz + SHA256SUMS.txt); GitHub Release v1.1.0 asset publication and npm publication both pending (Pack Lock source requires npm:)."
      },
      "x-mojobox-package": {
        "dsh": {
          "manifestVersion": 1,
          "bundle": {
            "patch": "./cordis.patch.yml"
          },
          "client": {
            "platform": "web",
            "inject": [],
            "external": [],
            "immediately": false
          }
        }
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "installer-policy"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.jing-hy.computer-user",
      "name": "computer-user",
      "version": "0.3.6",
      "facets": {
        "host": {
          "entry": "src/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/jing-hy/computer-user",
        "revision": "0.3.6"
      },
      "artifact": {
        "digest": "sha256:cf6e505c7ff76fec961cea757796b07b79e524b4c8b4403aa1319f74526b655b",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/computer-user/-/computer-user-0.3.6.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh-plugin.json"
      },
      "x-mojobox-distribution": {
        "distributionClass": "external",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.jing-hy.picturereader",
      "name": "picturereader",
      "version": "3.3.1",
      "facets": {
        "host": {
          "entry": "src/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/jing-hy/picturereader",
        "revision": "3.3.1"
      },
      "artifact": {
        "digest": "sha256:0a04a1cfbb1f630bbedb867f876636b16637697f4107fe6356ce38b5ce8d9728",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/picturereader/-/picturereader-3.3.1.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh-plugin.json"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.liliucourier.dsh-chat-outline",
      "name": "dsh-chat-outline",
      "version": "0.1.10",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/liliuCourier/dsh-chat-outline",
        "revision": "0.1.10"
      },
      "artifact": {
        "digest": "sha256:645d7cb30a84130019dc50f922d254aebf5f85002c1942a5d2174c0f8e0fe20a",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/dsh-chat-outline/-/dsh-chat-outline-0.1.10.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh-plugin.json"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.luaphes.dsh-web-attention-badge",
      "name": "dsh-web-attention-badge",
      "version": "0.3.2",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/Luaphes/dsh-web-attention-badge",
        "revision": "0.3.2"
      },
      "artifact": {
        "digest": "sha256:bdb93b1e49821725d075f8ce4af24e01fe50f4bf73d09c8805b8ed942b07aa21",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/dsh-web-attention-badge/-/dsh-web-attention-badge-0.3.2.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh-plugin.json"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.nwflower.dsh-file-claim",
      "name": "dsh-file-claim",
      "version": "0.2.0",
      "facets": {
        "host": {
          "entry": "index.mjs",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/Nwflower/dsh-file-claim",
        "revision": "0.2.0"
      },
      "artifact": {
        "digest": "sha256:45bd87bc6cbb566278f3c8b1510ecd028817f8bb5365b1a8c8bd7e6b741a61db",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/dsh-file-claim/-/dsh-file-claim-0.2.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh-plugin.json"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.omdsh.dsh-better-sidebar",
      "name": "dsh-better-sidebar",
      "version": "0.12.2",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/omdsh-dev/DSH-better-sidebar",
        "revision": "0.12.2"
      },
      "artifact": {
        "digest": "sha256:5f80d9cfd7f250a675cf9bc7f951ca246c047f09607200831733f845c8255d0f",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/dsh-better-sidebar/-/dsh-better-sidebar-0.12.2.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh-plugin.json"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.phant0meow.meow-smooth",
      "name": "meow-smooth",
      "version": "0.5.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/Phant0Meow/dsh-meow-smooth",
        "revision": "c7bbe6f0419a5a2ca9f3e9eb62003d693735cdd6"
      },
      "artifact": {
        "digest": "sha256:52fda95a198e84639a821031de69d1137acb5b4d3db53cc84fdb72223e9dea55",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/meow-smooth/-/meow-smooth-0.5.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained"
      },
      "x-mojobox-distribution": {
        "distributionClass": "external",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.scorp1o117.dsh-soul-md",
      "name": "dsh-soul-md",
      "version": "0.2.8",
      "facets": {
        "host": {
          "entry": "index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/Scorp1o117/dsh-soul-md",
        "revision": "0.2.8"
      },
      "artifact": {
        "digest": "sha256:a3117a55e31c3594542f3c7c113b0620ab50de3867cef7ede36a59158cbc3dbd",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/dsh-soul-md/-/dsh-soul-md-0.2.8.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh-plugin.json"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.tt-a1i.archify-dsh",
      "name": "@tt-a1i/archify-dsh",
      "version": "0.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/tt-a1i/archify",
        "revision": "fc6e8aca1829a02af0f0efdc193a87c3754d373c"
      },
      "artifact": {
        "digest": "sha256:3192afe54949da6494acea3bd2bf5113a58ea78651113b1289bcc7212130df38",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/@tt-a1i/archify-dsh/-/archify-dsh-0.1.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh-plugin.json"
      },
      "x-mojobox-package": {
        "dsh": {
          "bundle": {
            "patch": "./cordis.patch.yml"
          }
        }
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.wine-red.dsh-prompt-stash",
      "name": "dsh-prompt-stash",
      "version": "0.2.5",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/Wine-Red/dsh-prompt-stash",
        "revision": "0.2.5"
      },
      "artifact": {
        "digest": "sha256:126153c3a112d36f4d48ea1f08334a3176a01945bc142e4544353a6d804dce18",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/dsh-prompt-stash/-/dsh-prompt-stash-0.2.5.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh-plugin.json"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.zouyuxuan122.dsh-our-free-model",
      "name": "dsh-our-free-model",
      "version": "1.3.0",
      "facets": {
        "host": {
          "entry": "index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/zouyuxuan122/dsh-our-free-model",
        "revision": "73e057d783e6002582395dd476b24cc4ee959bfd"
      },
      "x-ecosystem-packaging": {
        "adapterIsolation": "adapter/kernel.js is the only module that may import @deepseek-ai/*; enforced by the source catalog gate",
        "managedInstallation": "set distribution=managed to stand down the self-updater, announcement feed and hot reload",
        "integrityRecord": "upstream catalog/integrity.json is generated from the release manifest"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "artifactStatus": "unpublished",
        "reason": "package.json is private and no npm artifact is published; upstream release channel is its in-app upgrader feed"
      }
    }
  ],
  "packs": [
    {
      "$schema": "https://mojobox.dev/schemas/pack-v1alpha1.json",
      "apiVersion": "packs.mojobox.dev/v1alpha1",
      "kind": "Pack",
      "metadata": {
        "id": "dev.aio.appearance",
        "version": "0.1.0",
        "name": "AIO 外观包",
        "description": "从 DSHEAC AIO v1.1.0 提炼的导航、壁纸和鲸鱼挂件外观组件，不包含功能包依赖。",
        "category": "appearance"
      },
      "components": [
        {
          "id": "dev.aio.dsh-navbar",
          "version": "0.4.0",
          "required": true
        },
        {
          "id": "dev.aio.dsh-wallpaper-engine",
          "version": "0.6.8",
          "required": true
        },
        {
          "id": "dev.aio.dsh-whale-widget",
          "version": "0.2.10",
          "required": true
        }
      ],
      "requires": {
        "hostCapabilities": [
          "host.snapshot",
          "host.trial-boot"
        ],
        "platforms": [
          {
            "os": "win32",
            "arch": [
              "x64"
            ]
          }
        ]
      },
      "lock": {
        "$schema": "https://mojobox.dev/schemas/pack-lock-v1alpha1.json",
        "apiVersion": "packs.mojobox.dev/v1alpha1",
        "kind": "PackLock",
        "pack": "dev.aio.appearance@0.1.0",
        "components": [
          {
            "id": "dev.aio.dsh-navbar",
            "version": "0.4.0",
            "source": "npm:@vlln/dsh-navbar@0.4.0",
            "manifest": "catalog/plugins/dev.aio.dsh-navbar.json",
            "manifestDigest": "sha256:a56f9272bb05658d9a76ae3d7cb2a444996fd803d5cdae526dc5ca26091fdff3",
            "artifactDigest": "sha256:72886a2376c09e202a830029beb5503ce4710a9b208bacca8759c2d41a61c908"
          },
          {
            "id": "dev.aio.dsh-wallpaper-engine",
            "version": "0.6.8",
            "source": "npm:dsh-plugin-wallpaper-engine@0.6.8",
            "manifest": "catalog/plugins/dev.aio.dsh-wallpaper-engine.json",
            "manifestDigest": "sha256:0fb6106192f9c0a582984d1b2e5b483d6fd7ff88c0bb37918b728a15b2868fa9",
            "artifactDigest": "sha256:2ff76ed3b82937efe87ca829c7a4fca00b21ca521a208ffd501124f6b6f17006"
          },
          {
            "id": "dev.aio.dsh-whale-widget",
            "version": "0.2.10",
            "source": "npm:dsh-whale-widget@0.2.10",
            "manifest": "catalog/plugins/dev.aio.dsh-whale-widget.json",
            "manifestDigest": "sha256:f2325d8a50d17161fa931a66934eedfe0f9c0e4f563f7935b22f6e1a7835db78",
            "artifactDigest": "sha256:c53074c8e792a7f42c8341a45063276fa194307fc3752a594848cc64aa833bc2"
          }
        ]
      }
    },
    {
      "$schema": "https://mojobox.dev/schemas/pack-v1alpha1.json",
      "apiVersion": "packs.mojobox.dev/v1alpha1",
      "kind": "Pack",
      "metadata": {
        "id": "dev.aio.function",
        "version": "0.1.0",
        "name": "AIO 功能包",
        "description": "从 DSHEAC AIO v1.1.0 提炼的功能增强组件，不包含外观主题。",
        "category": "function"
      },
      "components": [
        {
          "id": "dev.aio.dsh-drag-and-drop",
          "version": "0.1.6",
          "required": true
        },
        {
          "id": "dev.aio.dsh-find-plugin",
          "version": "0.3.7",
          "required": true
        },
        {
          "id": "dev.aio.dsh-meme",
          "version": "0.1.40",
          "required": true
        },
        {
          "id": "dev.aio.dsh-smooth-stream",
          "version": "0.4.3",
          "required": true
        },
        {
          "id": "dev.aio.dsh-status-rotator",
          "version": "0.9.1",
          "required": true
        }
      ],
      "requires": {
        "hostCapabilities": [
          "host.snapshot",
          "host.trial-boot"
        ],
        "platforms": [
          {
            "os": "win32",
            "arch": [
              "x64"
            ]
          }
        ]
      },
      "lock": {
        "$schema": "https://mojobox.dev/schemas/pack-lock-v1alpha1.json",
        "apiVersion": "packs.mojobox.dev/v1alpha1",
        "kind": "PackLock",
        "pack": "dev.aio.function@0.1.0",
        "components": [
          {
            "id": "dev.aio.dsh-drag-and-drop",
            "version": "0.1.6",
            "source": "npm:dsh-drag-and-drop@0.1.6",
            "manifest": "catalog/plugins/dev.aio.dsh-drag-and-drop.json",
            "manifestDigest": "sha256:c1c2e28880034d81e7744a7015f373d547b4f5c398fc6577d6c319904124be64",
            "artifactDigest": "sha256:d50d050373555a73d43bd0ff400028b4012b7375ec5b1134f76adaa48859b8f0"
          },
          {
            "id": "dev.aio.dsh-find-plugin",
            "version": "0.3.7",
            "source": "npm:dsh-find-plugin@0.3.7",
            "manifest": "catalog/plugins/dev.aio.dsh-find-plugin.json",
            "manifestDigest": "sha256:b2506d0a66aacbd0f97566b140989254fd5e8b866f65590fd2782f5732ee39cc",
            "artifactDigest": "sha256:46c408fc9f649b90ec25b30fa02dcc0f1e783c4a269e82468b7095ce1cffa992"
          },
          {
            "id": "dev.aio.dsh-meme",
            "version": "0.1.40",
            "source": "npm:dsh-meme@0.1.40",
            "manifest": "catalog/plugins/dev.aio.dsh-meme.json",
            "manifestDigest": "sha256:675fde5094ef329747dbc5f2c24d89fa85e40310399ad67024a40b2aa88d497a",
            "artifactDigest": "sha256:aa472d113bd269f9807863fdea033293b158f3b2bb72cd07797eb55ed9d9bb55"
          },
          {
            "id": "dev.aio.dsh-smooth-stream",
            "version": "0.4.3",
            "source": "npm:dsh-smooth-stream@0.4.3",
            "manifest": "catalog/plugins/dev.aio.dsh-smooth-stream.json",
            "manifestDigest": "sha256:e812ca7dd7636858adb13834293349713c8baaf539c8b734912a84bd4ba75221",
            "artifactDigest": "sha256:8e1746b755d3d606d91641da9905e91647fe2a78a41d9a85f7a8b3a0b1a31038"
          },
          {
            "id": "dev.aio.dsh-status-rotator",
            "version": "0.9.1",
            "source": "npm:dsh-status-rotator@0.9.1",
            "manifest": "catalog/plugins/dev.aio.dsh-status-rotator.json",
            "manifestDigest": "sha256:8254ed4a8cab46d1dd39502c5ef6a3d4732619a70f3758bb05ebefeae0cc8848",
            "artifactDigest": "sha256:632723d46aae2d34fda28e588f21c628993c6f34afb4b354319661e3b13165a7"
          }
        ]
      }
    },
    {
      "$schema": "https://mojobox.dev/schemas/pack-v1alpha1.json",
      "apiVersion": "packs.mojobox.dev/v1alpha1",
      "kind": "Pack",
      "metadata": {
        "id": "dev.dsh-eac.recommended.v1",
        "version": "0.1.0",
        "name": "EAC 推荐插件包",
        "description": "EAC 推荐插件（L2）整合包：成员来自 DSH-Desktop-EAC 内置统一市场的 eacRecommended 名单。仅收录已发布且摘要可验证的 npm artifact；其余推荐成员（dsh-our-free-model）尚未发布，处于 source-pending，见 docs/eac-pack-coverage.md。",
        "category": "function"
      },
      "components": [
        {
          "id": "dev.tt-a1i.archify-dsh",
          "version": "0.1.0",
          "required": false
        },
        {
          "id": "dev.phant0meow.meow-smooth",
          "version": "0.5.0",
          "required": false
        }
      ],
      "requires": {
        "platforms": [
          {
            "os": "win32",
            "arch": [
              "x64"
            ]
          }
        ]
      },
      "lock": {
        "$schema": "https://mojobox.dev/schemas/pack-lock-v1alpha1.json",
        "apiVersion": "packs.mojobox.dev/v1alpha1",
        "kind": "PackLock",
        "pack": "dev.dsh-eac.recommended.v1@0.1.0",
        "components": [
          {
            "id": "dev.tt-a1i.archify-dsh",
            "version": "0.1.0",
            "source": "npm:@tt-a1i/archify-dsh@0.1.0",
            "manifest": "catalog/plugins/dev.tt-a1i.archify-dsh.json",
            "manifestDigest": "sha256:b5547bd6bdc011b8780a33c0b6b379ab5ae53775a145e905155791a5256c29c8",
            "artifactDigest": "sha256:3192afe54949da6494acea3bd2bf5113a58ea78651113b1289bcc7212130df38"
          },
          {
            "id": "dev.phant0meow.meow-smooth",
            "version": "0.5.0",
            "source": "npm:meow-smooth@0.5.0",
            "manifest": "catalog/plugins/dev.phant0meow.meow-smooth.json",
            "manifestDigest": "sha256:7ae275865630aae9cd3992684e039b9c86c3adf4e79c47004a2d4e6b632b2f83",
            "artifactDigest": "sha256:52fda95a198e84639a821031de69d1137acb5b4d3db53cc84fdb72223e9dea55"
          }
        ]
      }
    },
    {
      "$schema": "https://mojobox.dev/schemas/pack-v1alpha1.json",
      "apiVersion": "packs.mojobox.dev/v1alpha1",
      "kind": "Pack",
      "metadata": {
        "id": "dev.mojobox.focus-kit",
        "version": "0.1.0",
        "name": "专注工作包",
        "description": "提供会话侧栏与 Markdown 人设能力的固定组合。"
      },
      "components": [
        {
          "id": "dev.omdsh.dsh-better-sidebar",
          "version": "0.12.2",
          "required": true
        },
        {
          "id": "dev.scorp1o117.dsh-soul-md",
          "version": "0.2.8",
          "required": false
        }
      ],
      "requires": {
        "hostCapabilities": [
          "host.snapshot",
          "host.trial-boot"
        ]
      },
      "lock": {
        "$schema": "https://mojobox.dev/schemas/pack-lock-v1alpha1.json",
        "apiVersion": "packs.mojobox.dev/v1alpha1",
        "kind": "PackLock",
        "pack": "dev.mojobox.focus-kit@0.1.0",
        "components": [
          {
            "id": "dev.omdsh.dsh-better-sidebar",
            "version": "0.12.2",
            "source": "npm:dsh-better-sidebar@0.12.2",
            "manifest": "catalog/plugins/dev.omdsh.dsh-better-sidebar.json",
            "manifestDigest": "sha256:b2faa1e6a274e342dbbf23ce6e893677a14747a372a1912cd3f7b97f19c3680b",
            "artifactDigest": "sha256:5f80d9cfd7f250a675cf9bc7f951ca246c047f09607200831733f845c8255d0f"
          },
          {
            "id": "dev.scorp1o117.dsh-soul-md",
            "version": "0.2.8",
            "source": "npm:dsh-soul-md@0.2.8",
            "manifest": "catalog/plugins/dev.scorp1o117.dsh-soul-md.json",
            "manifestDigest": "sha256:84523258a280586872aab9571fc1edb5c53f63f94d01c8c620d80aa0a50f2a93",
            "artifactDigest": "sha256:a3117a55e31c3594542f3c7c113b0620ab50de3867cef7ede36a59158cbc3dbd"
          }
        ]
      }
    },
    {
      "$schema": "https://mojobox.dev/schemas/pack-v1alpha1.json",
      "apiVersion": "packs.mojobox.dev/v1alpha1",
      "kind": "Pack",
      "metadata": {
        "id": "dev.mojobox.windows-operator",
        "version": "0.2.0",
        "name": "Windows 操作包",
        "description": "面向 Windows 桌面操作、会话导航与并行工作流的固定测试组合。"
      },
      "components": [
        {
          "id": "dev.jing-hy.computer-user",
          "version": "0.3.6",
          "required": true
        },
        {
          "id": "dev.jing-hy.picturereader",
          "version": "3.3.1",
          "required": true
        },
        {
          "id": "dev.omdsh.dsh-better-sidebar",
          "version": "0.12.2",
          "required": true
        },
        {
          "id": "dev.luaphes.dsh-web-attention-badge",
          "version": "0.3.2",
          "required": true
        },
        {
          "id": "dev.liliucourier.dsh-chat-outline",
          "version": "0.1.10",
          "required": true
        },
        {
          "id": "dev.nwflower.dsh-file-claim",
          "version": "0.2.0",
          "required": true
        },
        {
          "id": "dev.wine-red.dsh-prompt-stash",
          "version": "0.2.5",
          "required": true
        }
      ],
      "requires": {
        "hostCapabilities": [
          "host.snapshot",
          "host.trial-boot"
        ],
        "platforms": [
          {
            "os": "win32",
            "arch": [
              "x64"
            ]
          }
        ]
      },
      "lock": {
        "$schema": "https://mojobox.dev/schemas/pack-lock-v1alpha1.json",
        "apiVersion": "packs.mojobox.dev/v1alpha1",
        "kind": "PackLock",
        "pack": "dev.mojobox.windows-operator@0.2.0",
        "components": [
          {
            "id": "dev.jing-hy.computer-user",
            "version": "0.3.6",
            "source": "npm:computer-user@0.3.6",
            "manifest": "catalog/plugins/dev.jing-hy.computer-user.json",
            "manifestDigest": "sha256:77c0fba9300db7cd8ef2e7b6d4ca2b366f768b8164fa5585faefd0378b68d8b9",
            "artifactDigest": "sha256:cf6e505c7ff76fec961cea757796b07b79e524b4c8b4403aa1319f74526b655b"
          },
          {
            "id": "dev.jing-hy.picturereader",
            "version": "3.3.1",
            "source": "npm:picturereader@3.3.1",
            "manifest": "catalog/plugins/dev.jing-hy.picturereader.json",
            "manifestDigest": "sha256:0e483d08bb1062bf07a289577e1a8e012a5632d34297d4f11632a2693f9d3570",
            "artifactDigest": "sha256:0a04a1cfbb1f630bbedb867f876636b16637697f4107fe6356ce38b5ce8d9728"
          },
          {
            "id": "dev.omdsh.dsh-better-sidebar",
            "version": "0.12.2",
            "source": "npm:dsh-better-sidebar@0.12.2",
            "manifest": "catalog/plugins/dev.omdsh.dsh-better-sidebar.json",
            "manifestDigest": "sha256:b2faa1e6a274e342dbbf23ce6e893677a14747a372a1912cd3f7b97f19c3680b",
            "artifactDigest": "sha256:5f80d9cfd7f250a675cf9bc7f951ca246c047f09607200831733f845c8255d0f"
          },
          {
            "id": "dev.luaphes.dsh-web-attention-badge",
            "version": "0.3.2",
            "source": "npm:dsh-web-attention-badge@0.3.2",
            "manifest": "catalog/plugins/dev.luaphes.dsh-web-attention-badge.json",
            "manifestDigest": "sha256:03ce9083a59caba88fce1a148b50ea14567fed453c60a4dbd5284081593fa7cb",
            "artifactDigest": "sha256:bdb93b1e49821725d075f8ce4af24e01fe50f4bf73d09c8805b8ed942b07aa21"
          },
          {
            "id": "dev.liliucourier.dsh-chat-outline",
            "version": "0.1.10",
            "source": "npm:dsh-chat-outline@0.1.10",
            "manifest": "catalog/plugins/dev.liliucourier.dsh-chat-outline.json",
            "manifestDigest": "sha256:2ef91762f7d66ce7d5227356b8026bb4cb0ff4eabdfdfdd90cadea3cbdc0a335",
            "artifactDigest": "sha256:645d7cb30a84130019dc50f922d254aebf5f85002c1942a5d2174c0f8e0fe20a"
          },
          {
            "id": "dev.nwflower.dsh-file-claim",
            "version": "0.2.0",
            "source": "npm:dsh-file-claim@0.2.0",
            "manifest": "catalog/plugins/dev.nwflower.dsh-file-claim.json",
            "manifestDigest": "sha256:b249c557d63ec200c0b9e6ad276a451bae896aa795540bffd07b94209a70138a",
            "artifactDigest": "sha256:45bd87bc6cbb566278f3c8b1510ecd028817f8bb5365b1a8c8bd7e6b741a61db"
          },
          {
            "id": "dev.wine-red.dsh-prompt-stash",
            "version": "0.2.5",
            "source": "npm:dsh-prompt-stash@0.2.5",
            "manifest": "catalog/plugins/dev.wine-red.dsh-prompt-stash.json",
            "manifestDigest": "sha256:89d606724bc33fc1a96a73e31370d58cbe40eecb5f819f4db0db593b0c97aba8",
            "artifactDigest": "sha256:126153c3a112d36f4d48ea1f08334a3176a01945bc142e4544353a6d804dce18"
          }
        ]
      }
    },
    {
      "metadata": {
        "id": "dev.dsh-eac.skins.v1",
        "version": "1.1.0",
        "name": "EAC 皮肤包",
        "description": "EAC 皮肤链：皮肤加载器 1.1.0 + 13 款公约皮肤（2 款参考实现 + 11 款迁移皮肤）。成员均为 Mojobox 目录中的真实记录，制品为 GitHub Release tgz（v1.1.0 资产与 npm 发布均待 M8）。",
        "category": "appearance"
      },
      "components": [
        {
          "id": "dev.eac.ui-skin-loader",
          "version": "1.1.0",
          "required": true
        },
        {
          "id": "dev.eac.skin-aurora",
          "version": "1.1.0",
          "required": false
        },
        {
          "id": "dev.eac.skin-blue-fantasy",
          "version": "1.1.0",
          "required": false
        },
        {
          "id": "dev.eac.skin-deep-whale-day-night",
          "version": "1.1.0",
          "required": false
        },
        {
          "id": "dev.eac.skin-dragon-heir",
          "version": "1.1.0",
          "required": false
        },
        {
          "id": "dev.eac.skin-inkwash",
          "version": "1.1.0",
          "required": false
        },
        {
          "id": "dev.eac.skin-maid-atelier",
          "version": "1.1.0",
          "required": false
        },
        {
          "id": "dev.eac.skin-miku",
          "version": "1.1.0",
          "required": false
        },
        {
          "id": "dev.eac.skin-minecraft",
          "version": "1.1.0",
          "required": false
        },
        {
          "id": "dev.eac.skin-qq98",
          "version": "1.1.0",
          "required": false
        },
        {
          "id": "dev.eac.skin-ths",
          "version": "1.1.0",
          "required": false
        },
        {
          "id": "dev.eac.skin-trading",
          "version": "1.1.0",
          "required": false
        },
        {
          "id": "dev.eac.skin-whale-song",
          "version": "1.1.0",
          "required": false
        },
        {
          "id": "dev.eac.skin-xp",
          "version": "1.1.0",
          "required": false
        }
      ],
      "x-dsh-eac-provenance": {
        "kind": "snapshot-derived",
        "reason": "Mojobox 尚无 eac.skins.v1 Pack 记录（M4 记 draft/source-pending）；此视图由真实目录记录派生（loader v1.1.0 + 13 款皮肤），不虚构 digest 或制品。桌面注册表将皮肤链登记为 builtin/bundled（不可取消勾选），安装器按自身策略呈现为「可选」外观包（可逐项取消勾选），分级来源如实标注为 installer-policy。",
        "sources": [
          "dev.eac.ui-skin-loader",
          "dev.eac.skin-aurora",
          "dev.eac.skin-blue-fantasy",
          "dev.eac.skin-deep-whale-day-night",
          "dev.eac.skin-dragon-heir",
          "dev.eac.skin-inkwash",
          "dev.eac.skin-maid-atelier",
          "dev.eac.skin-miku",
          "dev.eac.skin-minecraft",
          "dev.eac.skin-qq98",
          "dev.eac.skin-ths",
          "dev.eac.skin-trading",
          "dev.eac.skin-whale-song",
          "dev.eac.skin-xp"
        ]
      }
    }
  ]
}

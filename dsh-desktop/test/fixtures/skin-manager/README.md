# Skin manager integration fixture

`io.github.dsh-eac-community.fixture-session-1.0.0.dshpack.tar` is vendored byte-for-byte from dsh-ui-skin-manager commit `3e9933cc1529ca33c8223d9ca118866186b618c4`, path `test/fixtures/dist/io.github.dsh-eac-community.fixture-session-1.0.0.dshpack.tar`.

SHA-256: `c86daf979731f5de819af72dd1819d129e8c41259f86f5bf04df8adb91d431bc`.

This is the existing synthetic community/session conformance fixture, not the Endfield real-world theme and not a mock manager. Tests import its actual archive bytes using the production manager tgz pinned by `tauri-shell/skin-manager-artifact.lock.json`. No sibling checkout or network access is required. Missing/corrupt artifacts fail rather than skip.

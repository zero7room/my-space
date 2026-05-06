// bot-runtime entry point. Phase 0 wires up only a no-op startup; real
// API/SSE/runtime modules land in later phases.
async function main(): Promise<void> {
  console.log('bot-runtime: Phase 0 scaffold ok');
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);

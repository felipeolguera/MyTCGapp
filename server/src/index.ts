import { createApp } from "./app.js";

const PORT = Number(process.env.PORT ?? 3001);

const app = createApp();

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Archive Binder API listening on http://localhost:${PORT}`);
});

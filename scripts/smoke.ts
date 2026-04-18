const baseUrl = process.env.APP_URL ?? 'http://localhost:3000';
const url = `${baseUrl}/api/health`;

async function main(): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    console.error(`smoke: failed to connect to ${url}:`, err);
    process.exit(1);
  }

  console.log(`smoke: GET ${url} → ${res.status} ${res.statusText}`);

  if (res.status === 200) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

void main();

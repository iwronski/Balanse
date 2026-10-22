import { Redirect } from 'expo-router';

/** Legacy route: history now lives in the unified log. No data is touched. */
export default function History() {
  return <Redirect href="/log" />;
}

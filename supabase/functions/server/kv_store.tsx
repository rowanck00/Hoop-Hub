import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const TABLE = "kv_store_4cb0fb87";

export async function get(key: string) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error) {
    console.error("kv get failed", key, error);
    return null;
  }

  return data?.value ?? null;
}

export async function set(key: string, value: unknown) {
  const { error } = await supabase
    .from(TABLE)
    .upsert({ key, value });

  if (error) {
    console.error("kv set failed", key, error);
    throw error;
  }
}

export async function del(key: string) {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("key", key);

  if (error) {
    console.error("kv del failed", key, error);
    throw error;
  }
}

export async function getByPrefix(prefix: string) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("value")
    .like("key", `${prefix}%`);

  if (error) {
    console.error("kv getByPrefix failed", prefix, error);
    return [];
  }

  return (data ?? []).map((row) => row.value);
}

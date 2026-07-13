-- ============================================================================
--  Control plane (lerofucjmfrrduohnwet) — RPC de publication d'une version
--  Appelée par publish.sh (avec la service_role du control plane).
--  Upsert : crée le module si besoin, (ré)affecte l'URL CDN de la version,
--  et la définit comme version par défaut. À appliquer UNE FOIS.
-- ============================================================================
create or replace function public.publish_module_version(
    p_module      text,
    p_label       text,
    p_cdn_url     text,
    p_make_default boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
    insert into public.code_module (module_key, description)
    values (p_module, p_module)
    on conflict (module_key) do nothing;

    select id into v_id
    from public.code_version
    where module_key = p_module and label = p_label;

    if v_id is null then
        insert into public.code_version (module_key, label, source_type, cdn_url)
        values (p_module, p_label, 'cdn', p_cdn_url)
        returning id into v_id;
    else
        update public.code_version
        set cdn_url = p_cdn_url, source_type = 'cdn', code = null
        where id = v_id;
    end if;

    if p_make_default then
        update public.code_module set default_version_id = v_id where module_key = p_module;
    end if;

    return jsonb_build_object('module', p_module, 'label', p_label,
                              'version_id', v_id, 'cdn_url', p_cdn_url, 'default', p_make_default);
end $$;

-- Réservé à la service_role (le script). Personne d'autre.
revoke all on function public.publish_module_version(text, text, text, boolean) from public, anon, authenticated;

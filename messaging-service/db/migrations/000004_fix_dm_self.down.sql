-- Revert to original function without self-DM check
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_or_create_dm_channel(
    p_org_id UUID,
    p_user_a UUID,
    p_user_b UUID
) RETURNS UUID AS $$
DECLARE
    v_dm_pair TEXT;
    v_channel_id UUID;
BEGIN
    -- Canonical pair: always sorted so A→B and B→A produce same key
    v_dm_pair := CASE
        WHEN p_user_a < p_user_b THEN p_user_a::text || ':' || p_user_b::text
        ELSE p_user_b::text || ':' || p_user_a::text
    END;

    -- Try find existing
    SELECT id INTO v_channel_id
    FROM channels
    WHERE org_id = p_org_id
      AND type = 'dm'
      AND dm_pair = v_dm_pair;

    IF v_channel_id IS NOT NULL THEN
        RETURN v_channel_id;
    END IF;

    -- Create new DM channel
    INSERT INTO channels (org_id, name, type, dm_pair, created_by)
    VALUES (p_org_id, '', 'dm', v_dm_pair, p_user_a)
    RETURNING id INTO v_channel_id;

    -- Add both members
    INSERT INTO channel_members (channel_id, user_id, role)
    VALUES (v_channel_id, p_user_a, 'member'),
           (v_channel_id, p_user_b, 'member');

    RETURN v_channel_id;
END;
$$ LANGUAGE plpgsql;

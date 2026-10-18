package websocket

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/orbispm/orbispm/internal/domain"
)

func received(c *OrgConn) []WSMessage {
	var out []WSMessage
	for {
		select {
		case data := <-c.send:
			var m WSMessage
			_ = json.Unmarshal(data, &m)
			out = append(out, m)
		default:
			return out
		}
	}
}

func TestDeliverDrive_OnlyAudienceAndIDsOnly(t *testing.T) {
	h := NewOrgHub(nil)
	org := uuid.New()
	alice, bob := uuid.New(), uuid.New()
	aliceConn := NewOrgConn(alice, org, nil, 4)
	aliceTab2 := NewOrgConn(alice, org, nil, 4)
	bobConn := NewOrgConn(bob, org, nil, 4)
	otherOrg := NewOrgConn(alice, uuid.New(), nil, 4)
	for _, c := range []*OrgConn{aliceConn, aliceTab2, bobConn, otherOrg} {
		h.Join(c)
	}

	item := uuid.New()
	// Payload as it arrives from Redis (JSON-decoded), with a name that must not leak.
	h.deliverDrive(org, domain.DomainEvent{
		Type: domain.EventDriveItemCreated, OrgID: org.String(),
		Payload: map[string]any{
			"item_id": item.String(), "parent_id": nil, "scope": "team", "scope_id": uuid.NewString(),
			"name": "secret.pdf", "audience": []any{alice.String()},
		},
	})

	assert.Empty(t, received(bobConn))
	assert.Empty(t, received(otherOrg))
	for _, c := range []*OrgConn{aliceConn, aliceTab2} {
		msgs := received(c)
		require.Len(t, msgs, 1)
		assert.Equal(t, "event:drive.item.created", msgs[0].Action)
		var p map[string]any
		require.NoError(t, json.Unmarshal(msgs[0].Payload, &p))
		assert.ElementsMatch(t, []string{"type", "org_id", "item_id", "parent_id", "scope", "scope_id"}, keys(p))
		assert.Equal(t, item.String(), p["item_id"])
	}
}

func TestDeliverDrive_NoAudienceSendsNothing(t *testing.T) {
	h := NewOrgHub(nil)
	org := uuid.New()
	c := NewOrgConn(uuid.New(), org, nil, 4)
	h.Join(c)
	for _, aud := range []any{nil, []any{}, "garbage"} {
		h.deliverDrive(org, domain.DomainEvent{
			Type: domain.EventDriveItemTrashed, OrgID: org.String(),
			Payload: map[string]any{"item_id": uuid.NewString(), "audience": aud},
		})
	}
	assert.Empty(t, received(c))
}

func keys(m map[string]any) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

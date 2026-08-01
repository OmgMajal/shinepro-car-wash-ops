export async function audit(client, { actor, businessId, branchId = null, action, entityType, entityId = null, previousValues = null, newValues = null, reason = null, requestId = null }) {
  await client.query(`INSERT INTO audit_events(business_id,branch_id,user_id,role_key,action,entity_type,entity_id,previous_values,new_values,reason,request_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [businessId, branchId, actor?.userId || null, actor?.roles?.[0] || null, action, entityType, entityId, previousValues, newValues, reason, requestId]);
}

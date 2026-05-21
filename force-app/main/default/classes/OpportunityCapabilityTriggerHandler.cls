public with sharing class OpportunityCapabilityTriggerHandler {

    public static void handle(List<Opportunity> newOpps, Map<Id, Opportunity> oldMap) {
        List<Opportunity_Capability__c> toInsert = new List<Opportunity_Capability__c>();
        List<Opportunity_Capability__c> toUpdate = new List<Opportunity_Capability__c>();

        // ── Insert context ────────────────────────────────────────────────────
        if (oldMap == null) {
            for (Opportunity opp : newOpps) {
                if (opp.Capability_Business__c != null) {
                    toInsert.add(new Opportunity_Capability__c(
                        Opportunity__c        = opp.Id,
                        Capability__c         = opp.Capability_Business__c,
                        Revenue_Percentage__c = 100
                    ));
                }
            }
            if (!toInsert.isEmpty()) insert toInsert;
            return;
        }

        // ── Update context ────────────────────────────────────────────────────
        // Collect opportunities where the primary capability actually changed.
        Set<Id> changedOppIds = new Set<Id>();
        for (Opportunity opp : newOpps) {
            if (opp.Capability_Business__c != oldMap.get(opp.Id).Capability_Business__c) {
                changedOppIds.add(opp.Id);
            }
        }
        if (changedOppIds.isEmpty()) return;

        // Bulk-query existing junction records for changed opportunities.
        Map<Id, List<Opportunity_Capability__c>> junctionsByOpp = new Map<Id, List<Opportunity_Capability__c>>();
        for (Opportunity_Capability__c junc : [
            SELECT Id, Opportunity__c, Capability__c, Revenue_Percentage__c
            FROM Opportunity_Capability__c
            WHERE Opportunity__c IN :changedOppIds
        ]) {
            if (!junctionsByOpp.containsKey(junc.Opportunity__c)) {
                junctionsByOpp.put(junc.Opportunity__c, new List<Opportunity_Capability__c>());
            }
            junctionsByOpp.get(junc.Opportunity__c).add(junc);
        }

        for (Opportunity opp : newOpps) {
            if (!changedOppIds.contains(opp.Id) || opp.Capability_Business__c == null) continue;

            Id oldCapabilityId = oldMap.get(opp.Id).Capability_Business__c;
            List<Opportunity_Capability__c> juncs = junctionsByOpp.get(opp.Id);

            if (juncs == null || juncs.isEmpty()) {
                // No junction records yet — create the default one.
                toInsert.add(new Opportunity_Capability__c(
                    Opportunity__c        = opp.Id,
                    Capability__c         = opp.Capability_Business__c,
                    Revenue_Percentage__c = 100
                ));
            } else if (
                juncs.size() == 1 &&
                juncs[0].Capability__c == oldCapabilityId &&
                juncs[0].Revenue_Percentage__c == 100
            ) {
                // Single auto-created record still matching the old primary capability
                // at 100% — safe to update it to the new primary capability.
                juncs[0].Capability__c = opp.Capability_Business__c;
                toUpdate.add(juncs[0]);
            }
            // If multiple junction records exist the user has customised the split,
            // so we leave them alone.
        }

        if (!toInsert.isEmpty()) insert toInsert;
        if (!toUpdate.isEmpty()) update toUpdate;
    }
}

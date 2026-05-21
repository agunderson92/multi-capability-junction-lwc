public with sharing class OpportunityCapabilityController {

    // NOTE: Update Description__c below if your Service_Portfolio__c description field has a different API name.
    @AuraEnabled(cacheable=false)
    public static List<Service_Portfolio__c> searchCapabilities(String searchTerm) {
        if (String.isBlank(searchTerm)) {
            return new List<Service_Portfolio__c>();
        }
        String likePattern = '%' + searchTerm + '%';
        return [
            SELECT Id, Name, Type__c, Description__c
            FROM Service_Portfolio__c
            WHERE Active__c = true
              AND Type__c = 'Capability'
              AND Name LIKE :likePattern
            ORDER BY Name ASC
            LIMIT 10
        ];
    }

    @AuraEnabled(cacheable=true)
    public static List<Opportunity_Capability__c> getOpportunityCapabilities(Id opportunityId) {
        return [
            SELECT Id, Capability__c, Capability__r.Name, Capability__r.Type__c,
                   Capability__r.Description__c, Revenue_Percentage__c
            FROM Opportunity_Capability__c
            WHERE Opportunity__c = :opportunityId
            ORDER BY Capability__r.Name ASC
        ];
    }

    @AuraEnabled
    public static void saveOpportunityCapabilities(
        Id opportunityId,
        List<Opportunity_Capability__c> recordsToInsert,
        List<Opportunity_Capability__c> recordsToUpdate,
        List<Id> idsToDelete
    ) {
        if (idsToDelete != null && !idsToDelete.isEmpty()) {
            List<Opportunity_Capability__c> toDelete = [
                SELECT Id FROM Opportunity_Capability__c
                WHERE Id IN :idsToDelete AND Opportunity__c = :opportunityId
            ];
            delete toDelete;
        }
        if (recordsToInsert != null && !recordsToInsert.isEmpty()) {
            for (Opportunity_Capability__c oc : recordsToInsert) {
                oc.Opportunity__c = opportunityId;
            }
            insert recordsToInsert;
        }
        if (recordsToUpdate != null && !recordsToUpdate.isEmpty()) {
            update recordsToUpdate;
        }
    }
}

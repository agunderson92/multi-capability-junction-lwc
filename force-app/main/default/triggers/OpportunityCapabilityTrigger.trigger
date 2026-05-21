trigger OpportunityCapabilityTrigger on Opportunity (after insert, after update) {
    OpportunityCapabilityTriggerHandler.handle(Trigger.new, Trigger.oldMap);
}

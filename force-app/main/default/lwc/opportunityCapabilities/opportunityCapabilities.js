import { LightningElement, api, wire, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';
import getOpportunityCapabilities from '@salesforce/apex/OpportunityCapabilityController.getOpportunityCapabilities';
import searchCapabilities from '@salesforce/apex/OpportunityCapabilityController.searchCapabilities';
import saveOpportunityCapabilities from '@salesforce/apex/OpportunityCapabilityController.saveOpportunityCapabilities';

const EPSILON = 0.005;

export default class OpportunityCapabilities extends LightningElement {
    @api recordId;

    @track capabilities = [];
    @track deletedIds = [];
    @track isDirty = false;
    @track isLoading = false;

    @track searchTerm = '';
    @track searchResults = [];
    @track showDropdown = false;
    @track selectedCapability = null;
    @track newPercentage = '';

    _wiredResult;
    _searchTimeout;

    // ── Wire ──────────────────────────────────────────────────────────────────

    @wire(getOpportunityCapabilities, { opportunityId: '$recordId' })
    wiredCapabilities(result) {
        this._wiredResult = result;
        if (result.data) {
            this.capabilities = result.data.map(oc => this._mapRecord(oc));
            this.isDirty = false;
            this.deletedIds = [];
        } else if (result.error) {
            this._toast('Error loading capabilities', this._errorMessage(result.error), 'error');
        }
    }

    // ── Getters ───────────────────────────────────────────────────────────────

    get totalPercentage() {
        const raw = this.capabilities.reduce((sum, c) => sum + (Number(c.percentage) || 0), 0);
        return Math.round(raw * 100) / 100;
    }

    get isValid() {
        return Math.abs(this.totalPercentage - 100) < EPSILON;
    }

    get hasCapabilities() {
        return this.capabilities.length > 0;
    }

    get cannotAdd() {
        return !this.selectedCapability || !this.newPercentage || Number(this.newPercentage) <= 0;
    }

    get saveDisabled() {
        return !this.isValid || this.isLoading;
    }

    get totalBannerClass() {
        return `total-banner${this.isValid ? ' total-banner_valid' : ''}`;
    }

    get totalTextClass() {
        if (this.isValid) return 'total-text total-text_valid';
        if (this.totalPercentage > 100) return 'total-text total-text_error';
        return 'total-text total-text_warning';
    }

    get progressFillClass() {
        if (this.isValid) return 'progress-fill progress-fill_valid';
        if (this.totalPercentage > 100) return 'progress-fill progress-fill_error';
        return 'progress-fill progress-fill_warning';
    }

    get progressFillStyle() {
        return `width: ${Math.min(this.totalPercentage, 100)}%`;
    }

    get showAllocationHelper() {
        return !this.isValid && this.capabilities.length > 0;
    }

    get allocationHelperText() {
        const diff = 100 - this.totalPercentage;
        if (diff > EPSILON) return `${diff.toFixed(2)}% remaining to allocate`;
        return `${Math.abs(diff).toFixed(2)}% over-allocated — reduce percentages to save`;
    }

    get allocationHelperClass() {
        return this.totalPercentage > 100
            ? 'allocation-helper allocation-helper_error'
            : 'allocation-helper allocation-helper_warning';
    }

    get comboboxClass() {
        return `slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click${this.showDropdown ? ' slds-is-open' : ''}`;
    }

    // ── Search handlers ───────────────────────────────────────────────────────

    handleSearchInput(event) {
        this.searchTerm = event.target.value;
        this.selectedCapability = null;
        clearTimeout(this._searchTimeout);

        if (this.searchTerm.length < 2) {
            this.searchResults = [];
            this.showDropdown = false;
            return;
        }

        this._searchTimeout = setTimeout(() => this._doSearch(), 300);
    }

    handleSearchFocus() {
        if (this.searchResults.length > 0) {
            this.showDropdown = true;
        }
    }

    handleSearchBlur() {
        // Delay so onmousedown on a result fires before the dropdown closes.
        setTimeout(() => { this.showDropdown = false; }, 200);
    }

    handleCapabilitySelect(event) {
        event.preventDefault();
        const id = event.currentTarget.dataset.id;
        const found = this.searchResults.find(r => r.Id === id);
        if (found) {
            this.selectedCapability = found;
            this.searchTerm = found.Name;
            this.showDropdown = false;
            this.searchResults = [];
        }
    }

    // ── Add form handlers ─────────────────────────────────────────────────────

    handleNewPercentageChange(event) {
        this.newPercentage = event.detail.value;
    }

    handleAddCapability() {
        if (this.cannotAdd) return;

        this.capabilities = [
            ...this.capabilities,
            {
                id: null,
                capabilityId: this.selectedCapability.Id,
                name: this.selectedCapability.Name,
                type: this.selectedCapability.Type__c || '',
                description: this.selectedCapability.Description__c || '',
                percentage: Number(this.newPercentage),
                isNew: true,
                key: `new_${Date.now()}`
            }
        ];

        this.isDirty = true;
        this.selectedCapability = null;
        this.searchTerm = '';
        this.newPercentage = '';
    }

    // ── Table handlers ────────────────────────────────────────────────────────

    handlePercentageChange(event) {
        const key = event.currentTarget.dataset.key;
        const val = Number(event.target.value) || 0;
        this.capabilities = this.capabilities.map(c =>
            c.key === key ? { ...c, percentage: val } : c
        );
        this.isDirty = true;
    }

    handleDelete(event) {
        const key = event.currentTarget.dataset.key;
        const cap = this.capabilities.find(c => c.key === key);
        if (cap?.id) {
            this.deletedIds = [...this.deletedIds, cap.id];
        }
        this.capabilities = this.capabilities.filter(c => c.key !== key);
        this.isDirty = true;
    }

    // ── Save / Cancel ─────────────────────────────────────────────────────────

    async handleSave() {
        if (!this.isValid) {
            this._toast(
                'Cannot Save',
                `Revenue percentages must sum to 100%. Current total: ${this.totalPercentage}%`,
                'error'
            );
            return;
        }

        this.isLoading = true;
        try {
            const recordsToInsert = this.capabilities
                .filter(c => !c.id)
                .map(c => ({
                    Opportunity__c: this.recordId,
                    Capability__c: c.capabilityId,
                    Revenue_Percentage__c: c.percentage
                }));

            const recordsToUpdate = this.capabilities
                .filter(c => !!c.id)
                .map(c => ({
                    Id: c.id,
                    Capability__c: c.capabilityId,
                    Revenue_Percentage__c: c.percentage
                }));

            await saveOpportunityCapabilities({
                opportunityId: this.recordId,
                recordsToInsert,
                recordsToUpdate,
                idsToDelete: this.deletedIds
            });

            await refreshApex(this._wiredResult);
            this._toast('Saved', 'Opportunity capabilities updated successfully.', 'success');
        } catch (error) {
            this._toast('Save Failed', this._errorMessage(error), 'error');
        } finally {
            this.isLoading = false;
        }
    }

    handleCancel() {
        this.isDirty = false;
        this.deletedIds = [];
        this.selectedCapability = null;
        this.searchTerm = '';
        this.newPercentage = '';
        this.searchResults = [];
        this.showDropdown = false;
        if (this._wiredResult?.data) {
            this.capabilities = this._wiredResult.data.map(oc => this._mapRecord(oc));
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    async _doSearch() {
        try {
            const addedIds = new Set(this.capabilities.map(c => c.capabilityId));
            const results = await searchCapabilities({ searchTerm: this.searchTerm });
            this.searchResults = results.filter(r => !addedIds.has(r.Id));
            this.showDropdown = this.searchResults.length > 0;
        } catch (error) {
            this._toast('Search Error', this._errorMessage(error), 'error');
        }
    }

    _mapRecord(oc) {
        return {
            id: oc.Id,
            capabilityId: oc.Capability__c,
            name: oc.Capability__r.Name,
            type: oc.Capability__r.Type__c || '',
            description: oc.Capability__r.Description__c || '',
            percentage: oc.Revenue_Percentage__c,
            isNew: false,
            key: oc.Id
        };
    }

    _toast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }

    _errorMessage(error) {
        return error?.body?.message ?? error?.message ?? 'An unexpected error occurred.';
    }
}

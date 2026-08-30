import { TestBed } from '@angular/core/testing';
import { DonationForm } from './donation-form';
import type { DonationDraft } from '../../../data/models/donation';

describe('DonationForm', () => {
  function setup(initialValue: DonationDraft | null = null) {
    TestBed.configureTestingModule({ imports: [DonationForm] });
    const fixture = TestBed.createComponent(DonationForm);
    fixture.componentRef.setInput('eventId', 'e1');
    fixture.componentRef.setInput('initialValue', initialValue);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  }

  it('starts blank when there is no initial value', () => {
    const { component } = setup();
    expect(component.form.value.donorName).toBe('');
    expect(component.form.value.donationType).toBe('cash');
  });

  it('prefills every field from a previously-submitted draft (the "go back and edit" case)', () => {
    const { component } = setup({
      localId: 'l1',
      eventId: 'e1',
      donorName: 'Ama Owusu',
      amountMinor: 5000,
      donationType: 'mobile_money',
      onBehalfOf: 'The Mensah Family',
      donorPhone: '0244000000',
      notes: 'Handled with care',
    });

    expect(component.form.value).toEqual({
      donorName: 'Ama Owusu',
      amount: '50.00',
      donationType: 'mobile_money',
      onBehalfOf: 'The Mensah Family',
      donorPhone: '0244000000',
      notes: 'Handled with care',
    });
  });

  it('leaves amount blank for an in-kind draft with no amountMinor', () => {
    const { component } = setup({
      localId: 'l1',
      eventId: 'e1',
      donorName: 'Kofi',
      amountMinor: null,
      donationType: 'in_kind',
    });

    expect(component.form.value.amount).toBe('');
  });
});

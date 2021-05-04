// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * Component to display the list of work providers in the system. The component also
 * provides an action button to generate a creation code.
 */

import React, { ChangeEventHandler, FormEventHandler, Fragment } from 'react';

import { connect, ConnectedProps } from 'react-redux';
import { compose } from 'redux';

import { ColTextInput } from '../templates/FormInputs';
import { ErrorMessage, ProgressBar } from '../templates/Status';
import { TableColumnType, TableList } from '../templates/TableList';

import { AuthProviderName } from '../../db/Auth.extra';
import { WorkProvider, WorkProviderRecord } from '@karya/common';

import { BackendRequestInitAction } from '../../store/apis/APIs.auto';
import { DataProps, withData } from '../hoc/WithData';

/** Map get languages action creator to props */
const mapDispatchToProps = (dispatch: any) => {
  return {
    generateWorkProviderCC: (wp: WorkProvider) => {
      const action: BackendRequestInitAction = {
        type: 'BR_INIT',
        store: 'server_user',
        label: 'GENERATE_CC',
        request: wp,
      };
      dispatch(action);
    },
  };
};

/** Create the connector HoC */
const reduxConnector = connect(null, mapDispatchToProps);
const dataConnector = withData('server_user');
const connector = compose(dataConnector, reduxConnector);

/** LanugageList has only connected props */
type WorkProviderListProps = DataProps<typeof dataConnector> & ConnectedProps<typeof reduxConnector>;

/** Component only tracks status of existing request */
type WorkProviderListState = {
  ccForm: WorkProvider;
};

/** WorkProviderList component */
class WorkProviderList extends React.Component<WorkProviderListProps, WorkProviderListState> {
  // setup creation code state
  state: WorkProviderListState = {
    ccForm: { full_name: '', email: '', phone_number: '' },
  };

  // clear form
  clearForm = () => {
    const ccForm: WorkProvider = { full_name: '', email: '', phone_number: '' };
    this.setState({ ccForm });
  };

  // handle form change
  handleChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    const ccForm = { ...this.state.ccForm, [e.currentTarget.id]: e.currentTarget.value };
    this.setState({ ccForm });
  };

  // handle form submit
  handleCCFormSubmit: FormEventHandler = (e) => {
    e.preventDefault();
    this.props.generateWorkProviderCC(this.state.ccForm);
  };

  // On mount, get all work providers
  componentDidMount() {
    M.updateTextFields();
  }

  // On update, update text fields
  componentDidUpdate(prevProps: WorkProviderListProps) {
    if (prevProps.server_user.status === 'IN_FLIGHT' && this.props.server_user.status === 'SUCCESS') {
      this.clearForm();
    }
    M.updateTextFields();
  }

  render() {
    const server_users = this.props.server_user.data;

    /** Extract error message element */
    const errorMessageElement =
      this.props.server_user.status === 'FAILURE' ? (
        <div>
          <ErrorMessage message={this.props.server_user.messages} />
        </div>
      ) : null;

    const tableColumns: Array<TableColumnType<WorkProviderRecord>> = [
      { header: 'Admin', type: 'function', function: (wp) => (wp.role === 'admin' ? 'Yes' : 'No') },
      { type: 'field', field: 'full_name', header: 'Name' },
      { type: 'field', field: 'email', header: 'Email' },
      { type: 'function', header: 'Registration Type', function: (wp) => AuthProviderName(wp.reg_mechanism) },
      { type: 'field', field: 'access_code', header: 'Access Code' },
    ];

    /** Function to sort the work providers */
    const sortWorkProviders = (a: WorkProviderRecord, b: WorkProviderRecord) => {
      if (a.role === b.role) {
        return new Date(a.created_at) < new Date(b.created_at) ? 1 : -1;
      }
      return a.role === 'admin' ? -1 : 1;
    };

    /** List of signed up work providers */
    const signedUpWorkProviders = server_users.filter((wp) => wp.reg_mechanism !== null).sort(sortWorkProviders);
    const createdWorkProviders = server_users.filter((wp) => wp.reg_mechanism === null).sort(sortWorkProviders);

    /** Creation code form */
    const { ccForm } = this.state;
    const creationCodeForm = (
      <div className='section'>
        <form onSubmit={this.handleCCFormSubmit}>
          <div className='row valign-wrapper'>
            <ColTextInput
              id='full_name'
              label='Full Name'
              required={true}
              value={ccForm.full_name ?? 'Unnamed'}
              onChange={this.handleChange}
              width='s3'
            />
            <ColTextInput
              id='email'
              label='Email'
              required={true}
              value={ccForm.email ?? 'No mail'}
              onChange={this.handleChange}
              width='s3'
            />
            <ColTextInput
              id='phone_number'
              label='Phone Number'
              required={true}
              value={ccForm.phone_number ?? 'No number'}
              onChange={this.handleChange}
              width='s3'
            />
            <div className='col s2'>
              <button className='btn red'>Generate Code</button>
            </div>
          </div>
        </form>
      </div>
    );

    return (
      <div className='tmar20'>
        {errorMessageElement}
        <Fragment>
          <TableList<WorkProviderRecord>
            columns={tableColumns}
            rows={signedUpWorkProviders}
            emptyMessage='No signed up work providers'
          />
          {this.props.server_user.status === 'IN_FLIGHT' ? <ProgressBar /> : creationCodeForm}
          <TableList<WorkProviderRecord>
            columns={tableColumns}
            rows={createdWorkProviders}
            emptyMessage='No new creation codes'
          />
        </Fragment>
      </div>
    );
  }
}

export default connector(WorkProviderList);

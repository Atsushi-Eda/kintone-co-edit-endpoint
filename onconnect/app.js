// Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10', region: process.env.AWS_REGION });

exports.handler = async event => {
  let connectionData;

  try {
    connectionData = await ddb.scan({ TableName: process.env.TABLE_NAME }).promise();
  } catch (e) {
    return { statusCode: 500, body: e.stack };
  }

  const putParams = {
    TableName: process.env.TABLE_NAME,
    Item: {
      connectionId: event.requestContext.connectionId,
      userId: event.queryStringParameters.userId,
      appId: event.queryStringParameters.appId,
      recordId: event.queryStringParameters.recordId,
    },
  };

  try {
    await ddb.put(putParams).promise();
  } catch (err) {
    return { statusCode: 500, body: 'Failed to connect: ' + JSON.stringify(err) };
  }

  const apigwManagementApi = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: event.requestContext.domainName + '/' + event.requestContext.stage
  });

  const postCalls = connectionData.Items.filter(({ connectionId, appId, recordId }) =>
    event.requestContext.connectionId !== connectionId &&
    event.queryStringParameters.appId === appId &&
    event.queryStringParameters.recordId === recordId
  ).map(async ({ connectionId }) => {
    try {
      await apigwManagementApi.postToConnection({
        ConnectionId: connectionId,
        Data: JSON.stringify({
          type: 'connect',
          userId: event.queryStringParameters.userId
        }),
      }).promise();
    } catch (e) {
      if (e.statusCode === 410) {
        console.log(`Found stale connection, deleting ${connectionId}`);
        await ddb.delete({ TableName: process.env.TABLE_NAME, Key: { connectionId } }).promise();
      } else {
        throw e;
      }
    }
  });

  // const postCallForSelf = apigwManagementApi.postToConnection({
  //   ConnectionId: event.requestContext.connectionId,
  //   Data: JSON.stringify({
  //     type: 'connections',
  //     userIds: connectionData.Items.filter(({ connectionId }) =>
  //       event.requestContext.connectionId !== connectionId
  //     ).map(({ userId }) => userId)
  //   }),
  // }).promise();

  try {
    await Promise.all(postCalls);
    // await Promise.all([...postCalls, postCallForSelf]);
  } catch (e) {
    console.log(e)
    return { statusCode: 500, body: e.stack };
  }

  return { statusCode: 200, body: 'Connected.' };
};

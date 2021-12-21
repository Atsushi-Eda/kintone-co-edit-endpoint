const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10', region: process.env.AWS_REGION });

const { TABLE_NAME } = process.env;

exports.handler = async event => {
  let connectionData;

  try {
    connectionData = await ddb.scan({ TableName: TABLE_NAME }).promise();
  } catch (e) {
    return { statusCode: 500, body: e.stack };
  }

  return { statusCode: 200, body: JSON.stringify({
    userIds: connectionData.Items.filter(({ appId, recordId }) =>
      event.queryStringParameters.appId === appId &&
      event.queryStringParameters.recordId === recordId
    ).map(({ userId }) => userId)})
  };
};

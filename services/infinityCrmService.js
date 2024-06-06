const axios = require('axios');
const querystring = require('querystring');
const crypto = require('crypto');

const loginToInfinityCRM = async () => {
    const username = 'amanda';
    const accessKey = 'sVRRDk21NPm996H0';

    const challengeResponse = await axios.get('https://infinitycrm.com.br/webservice.php', {
        params: {
            operation: 'getchallenge',
            username: username
        }
    });

    console.log(challengeResponse);
    if (!challengeResponse.data.success) {
        throw new Error('Failed to get challenge token');
    }

    const token = challengeResponse.data.result.token;
    const accessKeyHash = crypto.createHash('md5').update(token + accessKey).digest('hex');

    const loginResponse = await axios.post('https://infinitycrm.com.br/webservice.php',
        querystring.stringify({
            operation: 'login',
            username: username,
            accessKey: accessKeyHash
        }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

    if (!loginResponse.data.success) {
        console.log(loginResponse.data);
        throw new Error('Login failed');
    }

    return loginResponse.data.result.sessionName;
};

const sendMessageToInfinityCRM = async (sessionName, message, id, email) => {
    const response = await axios.post('https://infinitycrm.com.br/webservice.php',
        querystring.stringify({
            operation: 'ChatGTPApiSendMessage',
            sessionName: sessionName,
            message: message,
            id: id,
            email: email
        }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

    return response.data;
};

module.exports = {
    loginToInfinityCRM,
    sendMessageToInfinityCRM
};
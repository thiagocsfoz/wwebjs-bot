import axios from 'axios';
import querystring from 'querystring';
import md5 from 'md5';

export const loginToInfinityCRM = async () => {
    const username = 'amanda';
    const accessKey = 'sVRRDk21NPm996H0';

    const challengeResponse = await axios.get('https://infinitycrm.com.br/webservice.php', {
        params: {
            operation: 'getchallenge',
            username: username
        }
    });

    if (!challengeResponse.data.success) {
        throw new Error('Failed to get challenge token');
    }

    const token = challengeResponse.data.result.token;
    const accessKeyHash = md5(token + accessKey);

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

export const sendMessageToInfinityCRM = async (sessionName, message, id, email) => {
    console.log('sessionName ', sessionName);
    console.log('message ', message);
    console.log('id ', id);
    console.log('email ', email);
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

    console.log('sendMessageToInfinityCRM ', response.data)
    return response.data;
};

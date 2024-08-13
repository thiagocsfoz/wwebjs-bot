import packageJson from '../package.json' assert { type: 'json' };

export const healthCheck = async (req, res) => {
    res.status(200).json({
        status: 'ok',
        version: packageJson.version
    });
};

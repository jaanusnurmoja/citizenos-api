'use strict';

var _ = require('lodash');
var hooks = require('../../libs/sequelize/hooks');

/**
 * Vote
 *
 * @param {object} sequelize Sequelize instance
 * @param {object} DataTypes Sequelize DataTypes
 *
 * @returns {object} Sequelize model
 *
 * @see http://sequelizejs.com/docs/latest/models
 */
module.exports = function (sequelize, DataTypes) {
    var TYPES = {
        regular: 'regular',
        multiple: 'multiple'
    };

    var AUTH_TYPES = {
        soft: 'soft',
        hard: 'hard'
    };

    var SIGNING_METHODS = {
        mid: 'mid',
        idCard: 'idCard',
        smartId: 'smartId'
    };

    var Vote = sequelize.define(
        'Vote',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                allowNull: false,
                defaultValue: DataTypes.UUIDV4
            },
            minChoices: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 1,
                comment: 'Minimum number of choices a Voter has to choose when voting.'
            },
            maxChoices: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 1,
                comment: 'Maximum number of choices a Voter can choose when voting.'
            },
            delegationIsAllowed: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
                comment: 'Flag indicating if vote delegation is allowed.'
            },
            endsAt: {
                type: DataTypes.DATE,
                allowNull: true,
                defaultValue: null,
                comment: 'Deadline when voting closes. If NULL then no deadline at all.',
                validate: {
                    isAfter: {
                        args: [new Date().toString()],
                        msg: 'Voting deadline must be in the future.'
                    }
                }
            },
            description: {
                type: DataTypes.STRING(255),
                allowNull: true,
                defaultValue: null,
                comment: 'Vote description.',
                validate: {
                    len: {
                        args: [1, 255],
                        msg: 'Vote description can be 1 to 255 characters long.'
                    }
                }
            },
            type: {
                type: DataTypes.ENUM,
                values: _.values(TYPES),
                comment: 'Vote type. Used to decide visual layout.',
                allowNull: false,
                defaultValue: TYPES.regular
            },
            authType: {
                type: DataTypes.ENUM,
                values: _.values(AUTH_TYPES),
                allowNull: false,
                comment: 'Authorization types. Soft - user has to be logged in to Vote. Hard - user has to digitally sign a vote.',
                defaultValue: AUTH_TYPES.soft
            }
        }
    );

    Vote.associate = function (models) {
        Vote.belongsToMany(models.Topic, {
            through: models.TopicVote,
            foreignKey: 'voteId',
            constraints: true
        });

        Vote.hasMany(models.VoteOption, {
            foreignKey: 'voteId'
        });

        Vote.hasMany(models.VoteContainerFile, {
            foreignKey: 'voteId'
        });

        Vote.hasMany(models.VoteUserContainer, {
            foreignKey: 'voteId'
        });

        Vote.hasMany(models.VoteDelegation, {
            foreignKey: 'voteId'
        });
    };

    // Overrides the default toJSON() to avoid sensitive data from ending up in the output.
    // Must do until scopes arrive to Sequelize - https://github.com/sequelize/sequelize/issues/1462
    Vote.prototype.toJSON = function () {
        // Using whitelist instead of blacklist, so that no accidents occur when adding new properties.
        var data = {
            id: this.dataValues.id,
            minChoices: this.dataValues.minChoices,
            maxChoices: this.dataValues.maxChoices,
            delegationIsAllowed: this.dataValues.delegationIsAllowed,
            createdAt: this.dataValues.createdAt,
            endsAt: this.dataValues.endsAt,
            description: this.dataValues.description,
            type: this.dataValues.type,
            authType: this.dataValues.authType,
            downloads: this.dataValues.downloads // TODO: should be virtual?
        };

        // If Vote eagerly loads VoteOptions...
        if (this.dataValues.VoteOptions) {
            data.options = {
                count: this.dataValues.VoteOptions.length,
                rows: this.dataValues.VoteOptions
            };
        }

        // If Vote eagerly loads VoteDelegation
        if (this.dataValues.VoteDelegations && this.dataValues.VoteDelegations.length) {
            // Eager loaded is always an array, but we know there is only 1 delegation possible.
            var delegation = this.dataValues.VoteDelegations[0];
            if (delegation) {
                var User = delegation.dataValues.User;
                if (User) {
                    data.delegation = User;
                }
            }
        }

        return data;
    };

    /**
     * BeforeValidate hook
     *
     * Used for trimming all string values and sanitizing input before validators run.
     *
     * @see http://sequelize.readthedocs.org/en/latest/docs/hooks/
     */
    Vote.beforeValidate(hooks.trim);

    Vote.TYPES = TYPES;
    Vote.AUTH_TYPES = AUTH_TYPES;
    Vote.SIGNING_METHODS = SIGNING_METHODS;

    return Vote;
};

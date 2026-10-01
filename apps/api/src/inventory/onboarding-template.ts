/**
 * CloudFormation template that each monitored AWS account deploys (directly or via a
 * StackSet across the Organization) to grant CloudGuardian read-only inventory access.
 */
export function onboardingTemplate(principalArn: string, externalId: string) {
  return `AWSTemplateFormatVersion: '2010-09-09'
Description: CloudGuardian read-only inventory role
Parameters:
  CloudGuardianPrincipalArn:
    Type: String
    Default: ${principalArn}
  ExternalId:
    Type: String
    Default: ${externalId}
Resources:
  CloudGuardianInventoryRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: CloudGuardianInventory
      MaxSessionDuration: 3600
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              AWS: !Ref CloudGuardianPrincipalArn
            Action: sts:AssumeRole
            Condition:
              StringEquals:
                sts:ExternalId: !Ref ExternalId
      Policies:
        - PolicyName: CloudGuardianInventoryReadOnly
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action:
                  - ec2:DescribeInstances
                  - ec2:DescribeTags
                  - ec2:DescribeVolumes
                  - ec2:DescribeSecurityGroups
                  - ec2:DescribeVpcs
                  - ec2:DescribeSubnets
                  - elasticloadbalancing:DescribeLoadBalancers
                  - elasticloadbalancing:DescribeListeners
                  - elasticloadbalancing:DescribeTargetGroups
                  - elasticloadbalancing:DescribeTargetHealth
                  - elasticloadbalancing:DescribeTags
                  - autoscaling:DescribeAutoScalingGroups
                  - acm:ListCertificates
                  - acm:DescribeCertificate
                  - cloudwatch:GetMetricData
                  - cloudwatch:DescribeAlarms
                  - cloudwatch:DescribeAlarmsForMetric
                  - backup:ListBackupVaults
                  - backup:ListBackupJobs
                  - backup:ListProtectedResources
                  - backup:ListRecoveryPointsByBackupVault
                  - backup:DescribeBackupVault
                  - inspector2:ListFindings
                  - inspector2:ListCoverage
                  - inspector2:GetFindingsReportStatus
                  - iam:ListUsers
                  - iam:GetUser
                  - iam:ListAccessKeys
                  - iam:ListMFADevices
                  - iam:ListGroupsForUser
                  - iam:ListUserTags
                  - iam:GetLoginProfile
                  - iam:GetAccountSummary
                  - sts:GetCallerIdentity
                Resource: '*'
Outputs:
  RoleArn:
    Value: !GetAtt CloudGuardianInventoryRole.Arn
`;
}

export interface Person {
  id: string;
  name: string;
  role: string;
  department: string;
  email: string;
  initials: string;
}

export const people: Person[] = [
  // Management Team
  {
    id: '1',
    name: 'John Smith',
    role: 'Managing Director (MD)',
    department: 'Management',
    email: 'john.smith@meinhardt.com',
    initials: 'JS'
  },
  {
    id: '2',
    name: 'Sarah Johnson',
    role: 'Director (DI)',
    department: 'Management',
    email: 'sarah.johnson@meinhardt.com',
    initials: 'SJ'
  },
  {
    id: '3',
    name: 'Michael Brown',
    role: 'Team Leader (TL)',
    department: 'Operations',
    email: 'michael.brown@meinhardt.com',
    initials: 'MB'
  },
  {
    id: '4',
    name: 'Emily Davis',
    role: 'Team Leader (TL)',
    department: 'Engineering',
    email: 'emily.davis@meinhardt.com',
    initials: 'ED'
  },

  // Administration Team
  {
    id: '5',
    name: 'Robert Wilson',
    role: 'Administrator (ADM)',
    department: 'Administration',
    email: 'robert.wilson@meinhardt.com',
    initials: 'RW'
  },
  {
    id: '6',
    name: 'Lisa Anderson',
    role: 'Administrator (ADM)',
    department: 'Administration',
    email: 'lisa.anderson@meinhardt.com',
    initials: 'LA'
  },
  {
    id: '7',
    name: 'David Taylor',
    role: 'Administrator (ADM)',
    department: 'Administration',
    email: 'david.taylor@meinhardt.com',
    initials: 'DT'
  },

  // Information Management Team
  {
    id: '8',
    name: 'Jennifer Martinez',
    role: 'Information Management Representative (IMR)',
    department: 'Information Technology',
    email: 'jennifer.martinez@meinhardt.com',
    initials: 'JM'
  },
  {
    id: '9',
    name: 'Christopher Lee',
    role: 'Information Management Representative (IMR)',
    department: 'Information Technology',
    email: 'christopher.lee@meinhardt.com',
    initials: 'CL'
  },
  {
    id: '10',
    name: 'Amanda White',
    role: 'Information Management Representative (IMR)',
    department: 'Information Technology',
    email: 'amanda.white@meinhardt.com',
    initials: 'AW'
  },

  // Quality Management Team
  {
    id: '11',
    name: 'James Thompson',
    role: 'Quality Manager (QM)',
    department: 'Quality Assurance',
    email: 'james.thompson@meinhardt.com',
    initials: 'JT'
  },
  {
    id: '12',
    name: 'Maria Garcia',
    role: 'Quality Manager (QM)',
    department: 'Quality Assurance',
    email: 'maria.garcia@meinhardt.com',
    initials: 'MG'
  },

  // Project Management Team
  {
    id: '13',
    name: 'Kevin Rodriguez',
    role: 'Project Manager (PM)',
    department: 'Project Management',
    email: 'kevin.rodriguez@meinhardt.com',
    initials: 'KR'
  },
  {
    id: '14',
    name: 'Rachel Green',
    role: 'Project Manager (PM)',
    department: 'Project Management',
    email: 'rachel.green@meinhardt.com',
    initials: 'RG'
  },

  // Finance Team
  {
    id: '15',
    name: 'Daniel Kim',
    role: 'Finance Manager (FM)',
    department: 'Finance',
    email: 'daniel.kim@meinhardt.com',
    initials: 'DK'
  },
  {
    id: '16',
    name: 'Stephanie Chen',
    role: 'Finance Manager (FM)',
    department: 'Finance',
    email: 'stephanie.chen@meinhardt.com',
    initials: 'SC'
  }
];

// Helper functions to get people by role
export const getPeopleByRole = (role: string): Person[] => {
  return people.filter(person => person.role.includes(role));
};

export const getEvaluators = (): Person[] => {
  return getPeopleByRole('ADM');
};

export const getApprovers = (): Person[] => {
  return getPeopleByRole('MD').concat(getPeopleByRole('DI')).concat(getPeopleByRole('TL'));
};

export const getAcknowledgers = (): Person[] => {
  return getPeopleByRole('IMR');
};

export const getQualityManagers = (): Person[] => {
  return getPeopleByRole('QM');
};

export const getProjectManagers = (): Person[] => {
  return getPeopleByRole('PM');
};

export const getFinanceManagers = (): Person[] => {
  return getPeopleByRole('FM');
};



